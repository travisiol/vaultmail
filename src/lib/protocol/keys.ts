import { ed25519, x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { concatBytes } from "@noble/hashes/utils";
import { bytesToHex, hexToBytes, lower, utf8ToBytes } from "./encoding";
import { PROTOCOL_VERSION, type Address, type Hex, type Registration } from "./types";

/**
 * One wallet signature → two keys, on the device, deterministically.
 *
 * Ethereum wallets sign with RFC 6979 (deterministic nonces), so the same
 * wallet signing the same text produces the same bytes every time, on every
 * device. Hash those bytes and you have a seed nobody else can produce; expand
 * it with HKDF into an x25519 seal key and an ed25519 sign key. Nothing is
 * stored: sign again, get the same vault.
 *
 * Caveat, said out loud on the site: a wallet that does not sign
 * deterministically (some hardware and smart-contract wallets) yields a
 * different vault each time. The client detects the mismatch against the
 * published registration and says so instead of silently re-registering.
 */

export type VaultKeys = {
  address: Address;
  seal: { priv: Uint8Array; pub: Uint8Array };
  sign: { seed: Uint8Array; pub: Uint8Array };
};

const SEED_DOMAIN = utf8ToBytes("vaultmail/seed/v1");
const HKDF_SALT = utf8ToBytes("vaultmail");

export function unlockMessage(address: Address): string {
  return [
    "VAULT MAIL",
    "Unlock your vault",
    "",
    `Wallet: ${lower(address)}`,
    "Purpose: derive this wallet's vault keys on this device",
    "Cost: nothing - this is not a transaction",
    "",
    "Never sign this message anywhere but VAULT MAIL.",
    "Anyone holding this signature can read your mail.",
  ].join("\n");
}

export function registrationMessage(address: Address, sealPub: string, signPub: string): string {
  return [
    "VAULT MAIL",
    "Publish your vault keys",
    "",
    `Wallet: ${lower(address)}`,
    `Seal key: ${sealPub}`,
    `Sign key: ${signPub}`,
    `Version: ${PROTOCOL_VERSION}`,
    "",
    "Signing this lets other wallets seal mail to you.",
    "It is not a transaction.",
  ].join("\n");
}

export function deriveVaultKeys(address: Address, unlockSignature: Hex): VaultKeys {
  const sigBytes = hexToBytes(unlockSignature.slice(2));
  const seed = sha256(concatBytes(SEED_DOMAIN, sigBytes));
  const sealPriv = hkdf(sha256, seed, HKDF_SALT, utf8ToBytes("seal/x25519/v1"), 32);
  const signSeed = hkdf(sha256, seed, HKDF_SALT, utf8ToBytes("sign/ed25519/v1"), 32);
  return {
    address: lower(address),
    seal: { priv: sealPriv, pub: x25519.getPublicKey(sealPriv) },
    sign: { seed: signSeed, pub: ed25519.getPublicKey(signSeed) },
  };
}

/** The registration record a wallet publishes, minus the wallet's signature. */
export function registrationDraft(keys: VaultKeys): Omit<Registration, "walletSig"> {
  return {
    v: PROTOCOL_VERSION,
    address: keys.address,
    sealPub: bytesToHex(keys.seal.pub),
    signPub: bytesToHex(keys.sign.pub),
  };
}

/** True when the keys on this device are the ones the registry knows. */
export function matchesRegistration(keys: VaultKeys, reg: Pick<Registration, "sealPub" | "signPub">): boolean {
  return bytesToHex(keys.seal.pub) === reg.sealPub && bytesToHex(keys.sign.pub) === reg.signPub;
}
