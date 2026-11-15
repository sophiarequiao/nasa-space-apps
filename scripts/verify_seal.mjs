// Checks the encryption of the message to Earth (src/engine/seal.ts):
// 1) published vectors of the GCM specification, 2) the same bytes as OpenSSL (node:crypto), 3) what must be refused.
// Usage: node --experimental-strip-types scripts/verify_seal.mjs
// Synthetic data only. License: MIT. Written with AI assistance (Claude, Anthropic).
import nodeCrypto from "node:crypto";
import { newMissionKey, keyFromBytes, gcm, seal, open, peek, createSender, createReceiver, toHex, sealForEarth } from "../src/engine/seal.ts";

let failed = 0, checked = 0;
const check = (name, ok, detail = "") => { checked++; if (!ok) failed++; console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? `\n     ${detail}` : ""}`); };
const refuses = async (name, fn) => { let msg = null; try { await fn(); } catch (e) { msg = e.message; } check(name, msg != null, msg ? `refused: ${msg}` : "it was ACCEPTED"); };

// 1. Known answers: McGrew & Viega, "The Galois/Counter Mode of Operation (GCM)", Appendix B, AES-256
const zeroKey = await keyFromBytes(new Uint8Array(32)), zeroIv = new Uint8Array(12);
check("GCM specification, Test Case 13 (256-bit key of zeros, empty message): tag",
  toHex(await gcm(zeroKey, zeroIv, new Uint8Array(0))) === "530f8afbc74536b9a963b4f1c4cb738b");
check("GCM specification, Test Case 14 (256-bit key of zeros, 16 bytes of zeros): ciphertext and tag",
  toHex(await gcm(zeroKey, zeroIv, new Uint8Array(16))) === "cea7403d4d606b6e074ec5d3baf39d18" + "d0d1c8a799996bf0265b98b5d48ab919");

// 2. A message like the one the Message screen sends, sealed here and opened by OpenSSL (and the other way round)
const packet = { crew: "CM-2", day: 52, date: "2026-12-23", summary: "Speech rate 12% below your mean.",
  obs: [["speech_rate", 3.9, "syllables/s", "estimated"], ["pause_fraction", 0.31, "fraction", "estimated"], ["heart_rate", 74, "bpm", "estimated"], ["pain", 7, "0-10", "self_report"]] };
const raw = nodeCrypto.randomBytes(32), key = await keyFromBytes(new Uint8Array(raw));
const s1 = await seal(key, packet, { sender: 7, counter: 41 });
check("The sealed message is 28 bytes longer than the clear one (12 of IV + 16 of tag)", s1.frame.length === s1.clearBytes + 28, `${s1.clearBytes} bytes of numbers -> ${s1.frame.length} bytes on the link`);
check("The IV carries the sender (32 bits) and the counter (64 bits)", toHex(s1.frame, 12) === "00000007" + "0000000000000029" && peek(s1.frame).sender === 7 && peek(s1.frame).counter === 41);
const label = Buffer.from("SOSpesIA check-in v1");
const dec = nodeCrypto.createDecipheriv("aes-256-gcm", raw, s1.frame.subarray(0, 12)); dec.setAAD(label); dec.setAuthTag(s1.frame.subarray(s1.frame.length - 16));
const clear = Buffer.concat([dec.update(s1.frame.subarray(12, s1.frame.length - 16)), dec.final()]).toString("utf8");
check("OpenSSL opens what seal.ts sealed, and reads the same message", clear === JSON.stringify(packet));
const enc = nodeCrypto.createCipheriv("aes-256-gcm", raw, s1.frame.subarray(0, 12)); enc.setAAD(label);
const theirs = Buffer.concat([s1.frame.subarray(0, 12), enc.update(JSON.stringify(packet), "utf8"), enc.final(), enc.getAuthTag()]);
check("OpenSSL and seal.ts produce the same bytes", Buffer.compare(theirs, Buffer.from(s1.frame)) === 0);
const back = await open(key, new Uint8Array(theirs));
check("seal.ts opens what OpenSSL sealed", JSON.stringify(back.payload) === JSON.stringify(packet) && back.sender === 7 && back.counter === 41);
check("The clear text is not visible in the sealed bytes", !Buffer.from(s1.frame).includes(Buffer.from("CM-2")) && !Buffer.from(s1.frame).includes(Buffer.from("speech_rate")));

// 3. What must be refused
const flip = (frame, i) => { const f = frame.slice(); f[i] ^= 1; return f; };
await refuses("One bit changed in the message", () => open(key, flip(s1.frame, 30)));
await refuses("One bit changed in the tag", () => open(key, flip(s1.frame, s1.frame.length - 1)));
await refuses("One bit changed in the counter", () => open(key, flip(s1.frame, 11)));
await refuses("Message cut short", () => open(key, s1.frame.subarray(0, s1.frame.length - 5)));
await refuses("Another key", async () => open(await newMissionKey(), s1.frame));
await refuses("A 128-bit key instead of 256", () => keyFromBytes(new Uint8Array(16)));
await refuses("Counter 0 (the counter starts at 1)", () => seal(key, packet, { sender: 7, counter: 0 }));

// 4. Sender and receiver: the counter only goes up, a replay is refused
const mission = await newMissionKey(), tx = createSender(mission, 1), rx = createReceiver(mission);
const a = await tx.seal(packet), b = await tx.seal(packet), c = await tx.seal({ ...packet, day: 53 });
check("The same message sealed twice gives different bytes (the IV never repeats)", toHex(a.frame) !== toHex(b.frame) && a.counter === 1 && b.counter === 2 && c.counter === 3);
check("The receiver opens the messages in order", (await rx.open(a.frame)).counter === 1 && (await rx.open(b.frame)).payload.day === 52);
await refuses("The receiver refuses a message it already accepted (replay)", () => rx.open(a.frame));
check("...and still accepts the next new one", (await rx.open(c.frame)).payload.day === 53);
const ivs = new Set(); for (let i = 0; i < 2000; i++) ivs.add(toHex((await tx.seal({ i })).frame, 12));
check("2,000 messages in a row: 2,000 different IVs", ivs.size === 2000);

// 5. What the screens call
const r1 = await sealForEarth(packet), r2 = await sealForEarth(packet);
check("sealForEarth: sealed, opened with the same key, 28 bytes more, and the counter goes up",
  r1 && r2 && r1.opened && r2.opened && r1.wireBytes === r1.clearBytes + 28 && r2.counter === r1.counter + 1 && r1.hex !== r2.hex, r1 ? `${r1.clearBytes} -> ${r1.wireBytes} bytes · ${r1.hex}…` : "no report");

console.log(`\n${checked - failed}/${checked} encryption checks passed`);
process.exit(failed ? 1 : 0);
