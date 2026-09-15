import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import { bytesToHex, hexToBytes, isAddress, isHex, lower, utf8ToBytes } from "./encoding";
import type { VaultKeys } from "./keys";
import { LIMITS, type Address } from "./types";

/**
 * Authenticated API requests without sessions, cookies or server secrets.
 *
 * Every request that reads or writes a vault carries four headers signed by
 * the wallet's ed25519 sign key — the key the wallet published in its
 * registration. The server looks the key up by address and verifies. Nothing
 * to store, nothing to expire, nothing to leak between instances: the same
 * request verifies on any server that has the registry.
 *
 *   x-vault-address  the wallet
 *   x-vault-ts       unix ms; must be within LIMITS.requestSkewMs of now
 *   x-vault-nonce    8 random bytes, hex
 *   x-vault-sig      ed25519 over SHA-256("METHOD\npath?query\nts\nnonce\nsha256(body)")
 *
 * Replaying a captured request within the skew window re-does an idempotent
 * thing (reads, mark-as-read, insert-if-absent), which is why the writes are
 * keyed by client-chosen ids.
 */

export const AUTH_HEADERS = {
  address: "x-vault-address",
  ts: "x-vault-ts",
  nonce: "x-vault-nonce",
  sig: "x-vault-sig",
} as const;

export type AuthHeaders = Record<(typeof AUTH_HEADERS)[keyof typeof AUTH_HEADERS], string>;

function digest(method: string, pathWithQuery: string, ts: string, nonce: string, body: string): Uint8Array {
  const bodyHash = bytesToHex(sha256(utf8ToBytes(body)));
  return sha256(utf8ToBytes(`${method.toUpperCase()}\n${pathWithQuery}\n${ts}\n${nonce}\n${bodyHash}`));
}

export function signRequest(keys: VaultKeys, method: string, pathWithQuery: string, body = "", now = Date.now()): AuthHeaders {
  const ts = String(now);
  const nonce = bytesToHex(randomBytes(8));
  const sig = ed25519.sign(digest(method, pathWithQuery, ts, nonce, body), keys.sign.seed);
  return {
    [AUTH_HEADERS.address]: keys.address,
    [AUTH_HEADERS.ts]: ts,
    [AUTH_HEADERS.nonce]: nonce,
    [AUTH_HEADERS.sig]: bytesToHex(sig),
  };
}

export type VerifyResult = { ok: true; address: Address } | { ok: false; reason: string };

/**
 * `lookupSignPub` returns the registered sign key (hex) for an address, or
 * null when the wallet has no vault.
 */
export function verifyRequest(
  headers: { get(name: string): string | null },
  method: string,
  pathWithQuery: string,
  body: string,
  lookupSignPub: (address: Address) => string | null,
  now = Date.now(),
): VerifyResult {
  const address = headers.get(AUTH_HEADERS.address);
  const ts = headers.get(AUTH_HEADERS.ts);
  const nonce = headers.get(AUTH_HEADERS.nonce);
  const sig = headers.get(AUTH_HEADERS.sig);
  if (!address || !ts || !nonce || !sig) return { ok: false, reason: "Missing vault signature headers." };
  if (!isAddress(address) || address !== lower(address)) return { ok: false, reason: "Address malformed." };
  if (!/^\d{10,16}$/.test(ts) || Math.abs(now - Number(ts)) > LIMITS.requestSkewMs) return { ok: false, reason: "Request timestamp out of range — check your clock." };
  if (!isHex(nonce, 8) || !isHex(sig, 64)) return { ok: false, reason: "Nonce or signature malformed." };
  const signPub = lookupSignPub(address);
  if (!signPub) return { ok: false, reason: "This wallet has not opened a vault." };
  try {
    const valid = ed25519.verify(hexToBytes(sig), digest(method, pathWithQuery, ts, nonce, body), hexToBytes(signPub));
    return valid ? { ok: true, address } : { ok: false, reason: "Signature does not match the vault's sign key." };
  } catch {
    return { ok: false, reason: "Signature could not be checked." };
  }
}
