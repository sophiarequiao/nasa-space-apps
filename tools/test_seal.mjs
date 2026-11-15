// Test of the encryption of the check-in summary (src/engine/seal.js):  node tools/test_seal.mjs
// 1) published vectors of the GCM specification, 2) the same result as OpenSSL (node:crypto), 3) what must be refused.
// Synthetic crew data only. Drafted with AI assistance (Claude, Anthropic). MIT licence.
import nodeCrypto from 'node:crypto';
import { newMissionKey, keyFromBytes, gcm, seal, open, peek, createSender, createReceiver, toHex, toBase64 } from '../src/engine/seal.js';

let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `\n     ${detail}` : ''}`); };
const refuses = async (name, fn) => { let msg = null; try { await fn(); } catch (e) { msg = e.message; } check(name, msg != null, msg ? `refused: ${msg}` : 'it was ACCEPTED'); };

// --- 1. Known answers: McGrew & Viega, "The Galois/Counter Mode of Operation (GCM)", Appendix B, AES-256
const zeroKey = await keyFromBytes(new Uint8Array(32)), zeroIv = new Uint8Array(12);
check('GCM specification, Test Case 13 (256-bit key of zeros, empty message): tag',
  toHex(await gcm(zeroKey, zeroIv, new Uint8Array(0))) === '530f8afbc74536b9a963b4f1c4cb738b');
check('GCM specification, Test Case 14 (256-bit key of zeros, 16 bytes of zeros): ciphertext and tag',
  toHex(await gcm(zeroKey, zeroIv, new Uint8Array(16))) === 'cea7403d4d606b6e074ec5d3baf39d18' + 'd0d1c8a799996bf0265b98b5d48ab919');

// --- 2. A check-in summary, sealed here and opened by OpenSSL (and the other way round)
const summary = { crew: 'CM-2', time: '2026-11-15T12:00:00Z', flag: 'amber', note: 'Heads-up: 3 passive signals changed from your baseline.',
  observations: [{ signal: 'speech_rate', value: 3.9, unit: 'syl/s' }, { signal: 'perclos', value: 11, unit: '%' }, { signal: 'head_movement', value: 2.1, unit: '% of face width/s' }] };
const raw = nodeCrypto.randomBytes(32), key = await keyFromBytes(new Uint8Array(raw));
const s1 = await seal(key, summary, { sender: 7, counter: 41 });
check('The sealed message is 28 bytes longer than the clear one (12 of IV + 16 of tag)', s1.frame.length === s1.clearBytes + 28, `${s1.clearBytes} bytes of numbers -> ${s1.frame.length} bytes on the link`);
check('The IV carries the sender (32 bits) and the counter (64 bits)', toHex(s1.frame, 12) === '00000007' + '0000000000000029' && peek(s1.frame).sender === 7 && peek(s1.frame).counter === 41);
const label = Buffer.from('SOSpesAI check-in v1');
const dec = nodeCrypto.createDecipheriv('aes-256-gcm', raw, s1.frame.subarray(0, 12)); dec.setAAD(label); dec.setAuthTag(s1.frame.subarray(s1.frame.length - 16));
const clear = Buffer.concat([dec.update(s1.frame.subarray(12, s1.frame.length - 16)), dec.final()]).toString('utf8');
check('OpenSSL opens what seal.js sealed, and reads the same summary', clear === JSON.stringify(summary));
const enc = nodeCrypto.createCipheriv('aes-256-gcm', raw, s1.frame.subarray(0, 12)); enc.setAAD(label);
const theirs = Buffer.concat([s1.frame.subarray(0, 12), enc.update(JSON.stringify(summary), 'utf8'), enc.final(), enc.getAuthTag()]);
check('OpenSSL and seal.js produce the same bytes', Buffer.compare(theirs, Buffer.from(s1.frame)) === 0);
const back = await open(key, new Uint8Array(theirs));
check('seal.js opens what OpenSSL sealed', JSON.stringify(back.payload) === JSON.stringify(summary) && back.sender === 7 && back.counter === 41);
check('The clear text is not visible in the sealed bytes', !Buffer.from(s1.frame).includes(Buffer.from('CM-2')) && !Buffer.from(s1.frame).includes(Buffer.from('amber')));

// --- 3. What must be refused
const flip = (frame, i) => { const f = frame.slice(); f[i] ^= 1; return f; };
await refuses('One bit changed in the message', () => open(key, flip(s1.frame, 30)));
await refuses('One bit changed in the tag', () => open(key, flip(s1.frame, s1.frame.length - 1)));
await refuses('One bit changed in the counter', () => open(key, flip(s1.frame, 11)));
await refuses('Message cut short', () => open(key, s1.frame.subarray(0, s1.frame.length - 5)));
await refuses('Another key', async () => open(await newMissionKey(), s1.frame));
await refuses('A 128-bit key instead of 256', () => keyFromBytes(new Uint8Array(16)));
await refuses('Counter 0 (the counter starts at 1)', () => seal(key, summary, { sender: 7, counter: 0 }));

// --- 4. Sender and receiver: the counter only goes up, a replay is refused
const mission = await newMissionKey(), tx = createSender(mission, 1), rx = createReceiver(mission);
const a = await tx.seal(summary), b = await tx.seal(summary), c = await tx.seal({ ...summary, flag: 'green' });
check('The same summary sealed twice gives different bytes (the IV never repeats)', toBase64(a.frame) !== toBase64(b.frame) && a.counter === 1 && b.counter === 2 && c.counter === 3);
check('The receiver opens the messages in order', (await rx.open(a.frame)).counter === 1 && (await rx.open(b.frame)).payload.flag === 'amber');
await refuses('The receiver refuses a message it already accepted (replay)', () => rx.open(a.frame));
check('...and still accepts the next new one', (await rx.open(c.frame)).payload.flag === 'green');
let ivs = new Set(); for (let i = 0; i < 2000; i++) ivs.add(toHex((await tx.seal({ i })).frame, 12));
check('2,000 messages in a row: 2,000 different IVs', ivs.size === 2000);

console.log(fail ? `\n${fail} FAILURES` : '\nAll cases as expected');
process.exit(fail ? 1 : 0);
