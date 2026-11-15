// src/engine/seal.js — what leaves the spacecraft leaves encrypted: authenticated encryption of the check-in summary
// with AES-256-GCM, using the Web Crypto API that every browser (and Node) already has. No library, no server.
// API:
//   const key = await newMissionKey()            -> AES-256 key that cannot be exported from the browser
//   const tx = createSender(key, 1)              -> tx.seal(object)  -> { frame, sender, counter, clearBytes }
//   const rx = createReceiver(key)               -> rx.open(frame)   -> { payload, sender, counter }
//       frame: Uint8Array = 12 bytes of IV + ciphertext + 16 bytes of tag. Always 28 bytes more than the clear text.
//       rx.open throws if one bit of the frame was changed, if the key is another one, or if the message is not
//       newer than the last one accepted from that sender (a replayed message).
//   seal(key, object, { sender, counter }) / open(key, frame, { after }) / peek(frame): the same, one message at a time
//   gcm(key, iv, bytes, aad) / keyFromBytes(bytes): low level, used by the tests to check against the published vectors
//   toHex(bytes, max?) / toBase64(bytes): to show or store a frame as text
// What it follows:
//   - CCSDS 352.0-B-2, "CCSDS Cryptographic Algorithms" (Blue Book, August 2019): AES for all missions, a 256-bit key
//     for new ones, and AES in Galois/Counter Mode when a message needs to be both secret and authenticated.
//   - NIST SP 800-38D (GCM): 96-bit IV built the deterministic way, 32 bits of sender + 64 bits of a counter that
//     only goes up, so one key never sees the same IV twice. 128-bit tag.
//   - NASA-STD-3001 Vol. 1 [V1 6003]: medical communications that travel through the spacecraft link are private.
// The counter is also the protection against replays, the same idea as the sequence number of the CCSDS Space Data
// Link Security protocol (355.0-B). Messages are accepted in order only: a late one is dropped (ASSUMPTION for the demo).
// What it is NOT: key management. In a mission the key is loaded before launch and lives in protected hardware on
// both sides; here it is created in the browser when the page opens. Not audited, not certified.
// Checked in tools/test_seal.mjs against Test Cases 13 and 14 of the GCM specification and against OpenSSL.
// Drafted with AI assistance (Claude, Anthropic). MIT licence.

const LABEL = new TextEncoder().encode('SOSpesAI check-in v1');   // authenticated with every message, never encrypted
const IV_BYTES = 12, TAG_BYTES = 16;
const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('Encryption needs a secure page (https or localhost)');
  return c.subtle;
};

/** New AES-256-GCM key. It cannot be read out of the browser (extractable: false). */
export function newMissionKey() { return subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }

/** Key from 32 known bytes (tests, or a key agreed before launch). */
export function keyFromBytes(bytes) {
  if (!bytes || bytes.length !== 32) throw new Error('The key must be 32 bytes (256 bits)');
  return subtle().importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Low level: AES-GCM of `bytes` -> ciphertext followed by the 16-byte tag. */
export async function gcm(key, iv, bytes, aad = new Uint8Array(0)) {
  if (iv.length !== IV_BYTES) throw new Error('The IV must be 12 bytes (96 bits)');
  return new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: TAG_BYTES * 8 }, key, bytes));
}

function makeIv(sender, counter) {
  if (!Number.isInteger(sender) || sender < 0 || sender > 0xffffffff) throw new Error('sender must be a whole number that fits in 32 bits');
  if (!Number.isSafeInteger(counter) || counter < 1) throw new Error('counter must be a whole number, 1 or more');
  const iv = new Uint8Array(IV_BYTES), v = new DataView(iv.buffer);
  v.setUint32(0, sender); v.setBigUint64(4, BigInt(counter));
  return iv;
}

/** Who sent a frame and which message number it is, without opening it. */
export function peek(frame) {
  if (!(frame instanceof Uint8Array) || frame.length < IV_BYTES + TAG_BYTES) throw new Error('Not a sealed message');
  const v = new DataView(frame.buffer, frame.byteOffset, IV_BYTES);
  return { sender: v.getUint32(0), counter: Number(v.getBigUint64(4)) };
}

/** Encrypts one object. The caller makes sure `counter` is never used twice with the same key and sender. */
export async function seal(key, payload, { sender = 1, counter } = {}) {
  const clear = new TextEncoder().encode(JSON.stringify(payload)), iv = makeIv(sender, counter);
  const body = await gcm(key, iv, clear, LABEL), frame = new Uint8Array(IV_BYTES + body.length);
  frame.set(iv, 0); frame.set(body, IV_BYTES);
  return { frame, sender, counter, clearBytes: clear.length };
}

/** Opens one frame. `after`: the last counter already accepted from this sender (optional). */
export async function open(key, frame, { after = 0 } = {}) {
  const { sender, counter } = peek(frame);
  if (counter <= after) throw new Error('Replayed or out-of-order message: not accepted');
  let clear;
  try { clear = await subtle().decrypt({ name: 'AES-GCM', iv: frame.subarray(0, IV_BYTES), additionalData: LABEL, tagLength: TAG_BYTES * 8 }, key, frame.subarray(IV_BYTES)); }
  catch { throw new Error('The message was changed on the way or the key is not the right one: not accepted'); }
  return { payload: JSON.parse(new TextDecoder().decode(clear)), sender, counter };
}

/** Keeps the message counter of one sender. `start`: the last counter already used (0 for a new key). */
export function createSender(key, sender = 1, start = 0) {
  let n = start;
  return { seal: (payload) => seal(key, payload, { sender, counter: ++n }), get counter() { return n; } };
}

/** Keeps, per sender, the last counter accepted, and refuses anything that is not newer. */
export function createReceiver(key) {
  const last = new Map();
  return {
    async open(frame) {
      const { sender } = peek(frame), r = await open(key, frame, { after: last.get(sender) || 0 });
      last.set(sender, r.counter);
      return r;
    },
  };
}

export const toHex = (bytes, max = Infinity) => Array.from(bytes.subarray(0, Math.min(bytes.length, max)), b => b.toString(16).padStart(2, '0')).join('');
export function toBase64(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
