import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { concatBytes, randomBytes } from "@noble/hashes/utils";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  bytesToUtf8,
  canonical,
  hexToBytes,
  isAddress,
  isHex,
  lower,
  utf8ToBytes,
} from "./encoding";
import type { VaultKeys } from "./keys";
import {
  LIMITS,
  PROTOCOL_VERSION,
  type Address,
  type Envelope,
  type EnvelopeHeader,
  type OpenEnvelope,
  type Payload,
  type SealedEnvelope,
  type WrappedKey,
} from "./types";

/**
 * Sealing, opening and checking envelopes. Pure functions over bytes: the
 * same code runs in the browser, in the route handlers and in the tests.
 *
 * Sealed envelope, in order of construction:
 *   1. header  = { v, id, from, to, createdAt }            (cleartext, signed)
 *   2. content key K, 32 random bytes
 *   3. ct      = XChaCha20-Poly1305(K, nonce, payload JSON, aad = canonical(header))
 *      — the AAD ties the ciphertext to its header: a server that re-addresses
 *      or re-dates an envelope makes it undecryptable, not misleading.
 *   4. for each reader R in {to, from}: ECIES over x25519
 *      eph      = fresh x25519 key pair
 *      shared   = x25519(eph.priv, R.sealPub)
 *      wrapKey  = HKDF-SHA256(shared, salt = eph.pub || R.sealPub, info = "vaultmail/wrap/v1")
 *      box      = XChaCha20-Poly1305(wrapKey, nonce2, K, aad = canonical(header))
 *   5. sig     = Ed25519(sender.signSeed, SHA-256(canonical(everything above)))
 *
 * The server verifies (5) against the sender's published sign key before
 * storing; the reader verifies it again before trusting `from`.
 */

const WRAP_INFO = utf8ToBytes("vaultmail/wrap/v1");

export function newEnvelopeId(): string {
  return bytesToHex(randomBytes(16));
}

function signable(env: Omit<SealedEnvelope, "sig"> | Omit<OpenEnvelope, "sig">): Uint8Array {
  return sha256(utf8ToBytes(canonical(env)));
}

function headerOf(env: EnvelopeHeader): EnvelopeHeader {
  return { v: env.v, id: env.id, from: env.from, to: env.to, createdAt: env.createdAt };
}

function wrapFor(contentKey: Uint8Array, readerSealPub: Uint8Array, aad: Uint8Array): WrappedKey {
  const ephPriv = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, readerSealPub);
  const wrapKey = hkdf(sha256, shared, concatBytes(ephPub, readerSealPub), WRAP_INFO, 32);
  const nonce = randomBytes(24);
  const box = xchacha20poly1305(wrapKey, nonce, aad).encrypt(contentKey);
  return { eph: bytesToHex(ephPub), nonce: bytesToHex(nonce), box: bytesToBase64(box) };
}

function unwrapWith(wrapped: WrappedKey, keys: VaultKeys, aad: Uint8Array): Uint8Array {
  const ephPub = hexToBytes(wrapped.eph);
  const shared = x25519.getSharedSecret(keys.seal.priv, ephPub);
  const wrapKey = hkdf(sha256, shared, concatBytes(ephPub, keys.seal.pub), WRAP_INFO, 32);
  return xchacha20poly1305(wrapKey, hexToBytes(wrapped.nonce), aad).decrypt(base64ToBytes(wrapped.box));
}

export type SealInput = {
  to: Address;
  payload: Payload;
  /** The recipient's published seal key, hex. */
  recipientSealPub: string;
  id?: string;
  createdAt?: number;
};

/** Seal a payload from `sender` to `to`, readable by both. */
export function seal(sender: VaultKeys, input: SealInput): SealedEnvelope {
  const header: EnvelopeHeader = {
    v: PROTOCOL_VERSION,
    id: input.id ?? newEnvelopeId(),
    from: sender.address,
    to: lower(input.to),
    createdAt: input.createdAt ?? Date.now(),
  };
  assertPayload(input.payload);
  const aad = utf8ToBytes(canonical(header));
  const contentKey = randomBytes(32);
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(contentKey, nonce, aad).encrypt(utf8ToBytes(JSON.stringify(input.payload)));

  const keys: Record<string, WrappedKey> = {};
  keys[header.to] = wrapFor(contentKey, hexToBytes(input.recipientSealPub), aad);
  if (header.from !== header.to) keys[header.from] = wrapFor(contentKey, sender.seal.pub, aad);

  const unsigned: Omit<SealedEnvelope, "sig"> = {
    ...header,
    sealed: true,
    nonce: bytesToHex(nonce),
    ct: bytesToBase64(ct),
    keys,
  };
  const sig = ed25519.sign(signable(unsigned), sender.sign.seed);
  return { ...unsigned, sig: bytesToHex(sig) };
}

/** An envelope for a wallet that has no vault yet: signed, not encrypted. */
export function compose(sender: VaultKeys, input: Omit<SealInput, "recipientSealPub">): OpenEnvelope {
  assertPayload(input.payload);
  const unsigned: Omit<OpenEnvelope, "sig"> = {
    v: PROTOCOL_VERSION,
    id: input.id ?? newEnvelopeId(),
    from: sender.address,
    to: lower(input.to),
    createdAt: input.createdAt ?? Date.now(),
    sealed: false,
    payload: input.payload,
  };
  const sig = ed25519.sign(signable(unsigned), sender.sign.seed);
  return { ...unsigned, sig: bytesToHex(sig) };
}

/** Check the sender's signature. `senderSignPub` is the hex key from the registry. */
export function verifyEnvelope(env: Envelope, senderSignPub: string): boolean {
  try {
    const { sig, ...rest } = env;
    return ed25519.verify(hexToBytes(sig), signable(rest), hexToBytes(senderSignPub));
  } catch {
    return false;
  }
}

/** Decrypt with the reader's keys. Throws when the reader is not on the envelope or the seal is broken. */
export function open(env: Envelope, reader: VaultKeys): Payload {
  if (!env.sealed) return env.payload;
  const wrapped = env.keys[reader.address];
  if (!wrapped) throw new Error("This envelope was not sealed for this wallet.");
  const aad = utf8ToBytes(canonical(headerOf(env)));
  const contentKey = unwrapWith(wrapped, reader, aad);
  const plain = xchacha20poly1305(contentKey, hexToBytes(env.nonce), aad).decrypt(base64ToBytes(env.ct));
  const payload = JSON.parse(bytesToUtf8(plain)) as Payload;
  assertPayload(payload);
  return payload;
}

const KINDS = new Set(["message", "invoice", "request"]);

/** Shape and size checks shared by the composer and the server. Throws with a readable reason. */
export function assertPayload(p: unknown): asserts p is Payload {
  if (!p || typeof p !== "object") throw new Error("Payload must be an object.");
  const x = p as Record<string, unknown>;
  if (!KINDS.has(x.kind as string)) throw new Error("Unknown message kind.");
  if (typeof x.subject !== "string" || x.subject.length > LIMITS.subjectChars) throw new Error("Subject missing or too long.");
  if (typeof x.body !== "string" || x.body.length > LIMITS.bodyChars) throw new Error("Body missing or too long.");
  if (x.kind !== "message") {
    if (typeof x.amount !== "string" || !/^\d+(\.\d+)?$/.test(x.amount) || Number(x.amount) <= 0) throw new Error("Amount must be a positive number.");
    const t = x.token as Record<string, unknown> | undefined;
    if (!t || typeof t !== "object") throw new Error("Token missing.");
    if (t.kind !== "native" && !(t.kind === "erc20" && isAddress(t.address))) throw new Error("Token must be native or an ERC-20 address.");
    if (typeof t.symbol !== "string" || typeof t.decimals !== "number") throw new Error("Token symbol/decimals missing.");
  }
  if (x.due !== undefined && typeof x.due !== "number") throw new Error("Due date must be a timestamp.");
  if (x.number !== undefined && (typeof x.number !== "string" || x.number.length > 40)) throw new Error("Invoice number too long.");
  if (x.re !== undefined && !isHex(x.re, 16)) throw new Error("Reply reference malformed.");
  if (x.items !== undefined) {
    if (!Array.isArray(x.items) || x.items.length > LIMITS.items) throw new Error("Too many line items.");
    for (const it of x.items as Record<string, unknown>[]) {
      if (typeof it.label !== "string" || typeof it.qty !== "number" || typeof it.unit !== "string") throw new Error("Line item malformed.");
    }
  }
  if (utf8ToBytes(JSON.stringify(p)).length > LIMITS.payloadBytes) throw new Error("Message too large.");
}

/** Structural validation of an envelope that arrived over the network. */
export function assertEnvelopeShape(e: unknown): asserts e is Envelope {
  if (!e || typeof e !== "object") throw new Error("Envelope must be an object.");
  const x = e as Record<string, unknown>;
  if (x.v !== PROTOCOL_VERSION) throw new Error("Unsupported protocol version.");
  if (!isHex(x.id, 16)) throw new Error("Envelope id malformed.");
  if (!isAddress(x.from) || x.from !== lower(x.from)) throw new Error("Sender address malformed (must be lowercase).");
  if (!isAddress(x.to) || x.to !== lower(x.to)) throw new Error("Recipient address malformed (must be lowercase).");
  if (typeof x.createdAt !== "number" || !Number.isFinite(x.createdAt)) throw new Error("createdAt malformed.");
  if (!isHex(x.sig, 64)) throw new Error("Signature malformed.");
  if (x.sealed === true) {
    if (!isHex(x.nonce, 24)) throw new Error("Nonce malformed.");
    if (typeof x.ct !== "string" || x.ct.length > LIMITS.payloadBytes * 2) throw new Error("Ciphertext malformed.");
    const keys = x.keys as Record<string, unknown> | undefined;
    if (!keys || typeof keys !== "object") throw new Error("Wrapped keys missing.");
    const names = Object.keys(keys);
    if (!names.includes(x.to as string)) throw new Error("Envelope is not sealed for its recipient.");
    if (names.length > 2) throw new Error("Too many readers.");
    for (const name of names) {
      if (name !== x.to && name !== x.from) throw new Error("Unexpected reader on envelope.");
      const w = keys[name] as Record<string, unknown>;
      if (!w || !isHex(w.eph, 32) || !isHex(w.nonce, 24) || typeof w.box !== "string" || w.box.length > 200) throw new Error("Wrapped key malformed.");
    }
    const extra = Object.keys(x).filter((k) => !["v", "id", "from", "to", "createdAt", "sealed", "nonce", "ct", "keys", "sig"].includes(k));
    if (extra.length) throw new Error(`Unexpected field: ${extra[0]}`);
  } else if (x.sealed === false) {
    assertPayload(x.payload);
    const extra = Object.keys(x).filter((k) => !["v", "id", "from", "to", "createdAt", "sealed", "payload", "sig"].includes(k));
    if (extra.length) throw new Error(`Unexpected field: ${extra[0]}`);
  } else {
    throw new Error("sealed must be true or false.");
  }
}
