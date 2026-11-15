// What leaves the spacecraft leaves encrypted: authenticated encryption of the message to Earth with AES-256-GCM,
// through the Web Crypto API that every browser (and Node) already has. No library, no server.
//
// Contract (team):
//   const key = await newMissionKey()        AES-256 key that cannot be read out of the browser
//   const tx = createSender(key, 1)          tx.seal(object) -> { frame, sender, counter, clearBytes }
//   const rx = createReceiver(key)           rx.open(frame)  -> { payload, sender, counter }
//   frame = 12 bytes of IV + ciphertext + 16 bytes of tag: always 28 bytes more than the clear text.
//   rx.open throws if one bit was changed, if the key is another one, or if the message is a replay.
//   sealForEarth(object): the whole path for the screens (seal here, open "on Earth" with the same demo key).
//
// What it follows:
//  - CCSDS 352.0-B-2 "CCSDS Cryptographic Algorithms": AES, a 256-bit key for new missions, Galois/Counter Mode.
//  - NIST SP 800-38D: 96-bit IV built the deterministic way (32 bits of sender + 64 bits of a counter that only
//    goes up), so one key never sees the same IV twice; 128-bit tag. The counter also stops replays.
//  - NASA-STD-3001 Vol. 1 [V1 6003]: medical communications sent through the spacecraft link are private.
// What it is NOT: key management. A mission loads its key before launch and keeps it in protected hardware; here the
// key is created in the browser when the first message is sent. Not audited, not certified.
// Checked by scripts/verify_seal.mjs (GCM specification Test Cases 13 and 14, OpenSSL, tampering, replay).
// License: MIT. Written with AI assistance (Claude, Anthropic).

export interface SealedFrame { frame: Uint8Array; sender: number; counter: number; clearBytes: number }
export interface OpenedFrame { payload: unknown; sender: number; counter: number }
export interface Sender { seal(payload: unknown): Promise<SealedFrame>; readonly counter: number }
export interface Receiver { open(frame: Uint8Array): Promise<OpenedFrame> }
/** What the screens show after a message is sent. */
export interface SealReport { clearBytes: number; wireBytes: number; counter: number; hex: string; opened: boolean }

const LABEL = new TextEncoder().encode("SOSpesAI check-in v1"); // authenticated with every message, never encrypted
const IV_BYTES = 12, TAG_BYTES = 16;
const USES: KeyUsage[] = ["encrypt", "decrypt"];

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("Encryption needs a secure page (https or localhost)");
  return c.subtle;
}
/** A copy with its own buffer, which is what Web Crypto takes. */
const own = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

/** New AES-256-GCM key. It cannot be read out of the browser (extractable: false). */
export function newMissionKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, false, USES);
}

/** Key from 32 known bytes (checks, or a key agreed before launch). */
export async function keyFromBytes(bytes: Uint8Array): Promise<CryptoKey> {
  if (!bytes || bytes.length !== 32) throw new Error("The key must be 32 bytes (256 bits)");
  return subtle().importKey("raw", own(bytes), "AES-GCM", false, USES);
}

/** Low level: AES-GCM of `bytes` -> ciphertext followed by the 16-byte tag. */
export async function gcm(key: CryptoKey, iv: Uint8Array, bytes: Uint8Array, aad: Uint8Array = new Uint8Array(0)): Promise<Uint8Array> {
  if (iv.length !== IV_BYTES) throw new Error("The IV must be 12 bytes (96 bits)");
  return new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: own(iv), additionalData: own(aad), tagLength: TAG_BYTES * 8 }, key, own(bytes)));
}

function makeIv(sender: number, counter: number): Uint8Array {
  if (!Number.isInteger(sender) || sender < 0 || sender > 0xffffffff) throw new Error("sender must be a whole number that fits in 32 bits");
  if (!Number.isSafeInteger(counter) || counter < 1) throw new Error("counter must be a whole number, 1 or more");
  const iv = new Uint8Array(IV_BYTES), v = new DataView(iv.buffer);
  v.setUint32(0, sender); v.setBigUint64(4, BigInt(counter));
  return iv;
}

/** Who sent a frame and which message number it is, without opening it. */
export function peek(frame: Uint8Array): { sender: number; counter: number } {
  if (!(frame instanceof Uint8Array) || frame.length < IV_BYTES + TAG_BYTES) throw new Error("Not a sealed message");
  const v = new DataView(frame.buffer, frame.byteOffset, IV_BYTES);
  return { sender: v.getUint32(0), counter: Number(v.getBigUint64(4)) };
}

/** Encrypts one object. The caller makes sure `counter` is never used twice with the same key and sender. */
export async function seal(key: CryptoKey, payload: unknown, opts: { sender?: number; counter: number }): Promise<SealedFrame> {
  const sender = opts.sender ?? 1, counter = opts.counter;
  const clear = new TextEncoder().encode(JSON.stringify(payload)), iv = makeIv(sender, counter);
  const body = await gcm(key, iv, clear, LABEL), frame = new Uint8Array(IV_BYTES + body.length);
  frame.set(iv, 0); frame.set(body, IV_BYTES);
  return { frame, sender, counter, clearBytes: clear.length };
}

/** Opens one frame. `after`: the last counter already accepted from this sender. */
export async function open(key: CryptoKey, frame: Uint8Array, opts: { after?: number } = {}): Promise<OpenedFrame> {
  const { sender, counter } = peek(frame);
  if (counter <= (opts.after ?? 0)) throw new Error("Replayed or out-of-order message: not accepted");
  let clear: ArrayBuffer;
  try {
    clear = await subtle().decrypt({ name: "AES-GCM", iv: own(frame.subarray(0, IV_BYTES)), additionalData: own(LABEL), tagLength: TAG_BYTES * 8 }, key, own(frame.subarray(IV_BYTES)));
  } catch {
    throw new Error("The message was changed on the way or the key is not the right one: not accepted");
  }
  return { payload: JSON.parse(new TextDecoder().decode(clear)), sender, counter };
}

/** Keeps the message counter of one sender. `start`: the last counter already used (0 for a new key). */
export function createSender(key: CryptoKey, sender = 1, start = 0): Sender {
  let n = start;
  return { seal: (payload) => seal(key, payload, { sender, counter: ++n }), get counter() { return n; } };
}

/** Keeps, per sender, the last counter accepted, and refuses anything that is not newer. */
export function createReceiver(key: CryptoKey): Receiver {
  const last = new Map<number, number>();
  return {
    async open(frame) {
      const { sender } = peek(frame), r = await open(key, frame, { after: last.get(sender) ?? 0 });
      last.set(sender, r.counter);
      return r;
    },
  };
}

export function toHex(bytes: Uint8Array, max = Infinity): string {
  return Array.from(bytes.subarray(0, Math.min(bytes.length, max)), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The screens use one demo key for the whole visit: the spacecraft seals, and "Earth" (this same page, holding the
// same key) opens. Returns null where Web Crypto is missing (a page that is not https or localhost).
let demo: { tx: Sender; rx: Receiver } | null = null;
export async function sealForEarth(payload: unknown): Promise<SealReport | null> {
  try {
    if (!demo) { const key = await newMissionKey(); demo = { tx: createSender(key, 1), rx: createReceiver(key) }; }
    const s = await demo.tx.seal(payload);
    const back = await demo.rx.open(s.frame);
    return { clearBytes: s.clearBytes, wireBytes: s.frame.length, counter: s.counter, hex: toHex(s.frame, 28), opened: JSON.stringify(back.payload) === JSON.stringify(payload) };
  } catch {
    return null;
  }
}
