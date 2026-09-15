/**
 * VAULT MAIL protocol, version 1 — the shapes every side agrees on.
 *
 * A wallet's vault is two keys derived from one signature: a seal key
 * (x25519) that other wallets encrypt to, and a sign key (ed25519) that signs
 * envelopes and API requests. Both are published in a Registration the wallet
 * itself signs, so anyone can check "this seal key really belongs to 0x…"
 * without trusting the server.
 *
 * An Envelope is what travels and what is stored. Sealed: the payload is
 * encrypted with a fresh content key, and that content key is wrapped once
 * for the recipient and once for the sender (so both can read it later).
 * Unsealed: the recipient has not opened a vault yet, the payload is stored
 * as-is and everyone can see that it is.
 */

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export const PROTOCOL_VERSION = 1 as const;

export type Registration = {
  v: typeof PROTOCOL_VERSION;
  /** Lowercase wallet address. */
  address: Address;
  /** x25519 public key, 32 bytes hex (no 0x). Other wallets seal to it. */
  sealPub: string;
  /** ed25519 public key, 32 bytes hex (no 0x). Signs envelopes and requests. */
  signPub: string;
  /** EIP-191 signature by the wallet over `registrationMessage(...)`. */
  walletSig: Hex;
  /** Set by the server. */
  registeredAt?: number;
};

export type MessageKind = "message" | "invoice" | "request";

export type TokenRef =
  | { kind: "native"; symbol: string; decimals: number }
  | { kind: "erc20"; address: Address; symbol: string; decimals: number };

export type LineItem = { label: string; qty: number; unit: string };

/** What is inside the envelope. Everything here is sealed when it can be. */
export type Payload = {
  kind: MessageKind;
  subject: string;
  body: string;
  /** Decimal string in token units, e.g. "0.25". Invoices and requests only. */
  amount?: string;
  token?: TokenRef;
  /** Unix ms. */
  due?: number;
  /** Invoice number the sender chose, e.g. "INV-0042". */
  number?: string;
  items?: LineItem[];
  /** Id of the envelope this replies to. */
  re?: string;
};

export type EnvelopeHeader = {
  v: typeof PROTOCOL_VERSION;
  /** 16 random bytes, hex. Chosen by the sender. */
  id: string;
  from: Address;
  to: Address;
  /** Unix ms, sender's clock. */
  createdAt: number;
};

export type WrappedKey = {
  /** Ephemeral x25519 public key, hex. */
  eph: string;
  /** 24-byte XChaCha20 nonce, hex. */
  nonce: string;
  /** The wrapped 32-byte content key, base64. */
  box: string;
};

export type SealedEnvelope = EnvelopeHeader & {
  sealed: true;
  /** 24-byte nonce for the payload, hex. */
  nonce: string;
  /** XChaCha20-Poly1305 ciphertext of the JSON payload, base64. */
  ct: string;
  /** One wrapped content key per reader, keyed by lowercase address. */
  keys: Record<string, WrappedKey>;
  /** ed25519 signature by the sender's sign key, hex. */
  sig: string;
};

export type OpenEnvelope = EnvelopeHeader & {
  sealed: false;
  payload: Payload;
  sig: string;
};

export type Envelope = SealedEnvelope | OpenEnvelope;

/** A payment the server has verified onchain against an envelope. */
export type Receipt = {
  id: string;
  messageId: string;
  chainId: number;
  txHash: Hex;
  payer: Address;
  payee: Address;
  /** "native" or the token contract address. */
  token: string;
  /** Wei / base units as a decimal string. */
  amount: string;
  blockNumber: number;
  verifiedAt: number;
};

/** What the API returns for one message. */
export type StoredMessage = {
  envelope: Envelope;
  receivedAt: number;
  readAt: number | null;
  receipts: Receipt[];
};

export const LIMITS = {
  /** Plaintext payload JSON, bytes. */
  payloadBytes: 32 * 1024,
  subjectChars: 140,
  bodyChars: 8000,
  items: 40,
  /** Tolerated clock skew on signed requests, ms. */
  requestSkewMs: 5 * 60 * 1000,
} as const;
