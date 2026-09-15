import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

export { bytesToHex, hexToBytes, utf8ToBytes };

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Deterministic JSON: keys sorted at every level, no whitespace, `undefined`
 * dropped. What gets signed and what gets used as AEAD associated data must
 * serialise identically on every runtime, and JSON.stringify's key order is
 * insertion order, which is not a contract.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function isAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function isHex(value: unknown, bytes?: number): value is string {
  if (typeof value !== "string" || !/^[0-9a-f]*$/.test(value)) return false;
  return bytes === undefined ? value.length % 2 === 0 : value.length === bytes * 2;
}

export function lower(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}
