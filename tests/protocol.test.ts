import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { signRequest, verifyRequest, AUTH_HEADERS } from "../src/lib/protocol/auth";
import { canonical } from "../src/lib/protocol/encoding";
import { assertEnvelopeShape, compose, open, seal, verifyEnvelope } from "../src/lib/protocol/envelope";
import { deriveVaultKeys, matchesRegistration, registrationDraft, registrationMessage, unlockMessage } from "../src/lib/protocol/keys";
import type { Payload, SealedEnvelope } from "../src/lib/protocol/types";

/** Two throwaway wallets. viem signs deterministically (RFC 6979), like MetaMask. */
const alice = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const bob = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");

async function vaultFor(account: typeof alice) {
  const sig = await account.signMessage({ message: unlockMessage(account.address) });
  return deriveVaultKeys(account.address, sig);
}

const invoice: Payload = {
  kind: "invoice",
  subject: "Logo work, March",
  body: "Three concepts, two rounds, final files.",
  amount: "0.25",
  token: { kind: "native", symbol: "ETH", decimals: 18 },
  number: "INV-0042",
  due: 1_760_000_000_000,
  items: [{ label: "Concepts", qty: 3, unit: "0.05" }, { label: "Final files", qty: 1, unit: "0.10" }],
};

describe("key derivation", () => {
  it("is deterministic per wallet and different per wallet", async () => {
    const a1 = await vaultFor(alice);
    const a2 = await vaultFor(alice);
    const b = await vaultFor(bob);
    assert.equal(canonical(registrationDraft(a1)), canonical(registrationDraft(a2)));
    assert.notEqual(registrationDraft(a1).sealPub, registrationDraft(b).sealPub);
    assert.equal(a1.seal.pub.length, 32);
    assert.equal(a1.sign.pub.length, 32);
    assert.equal(a1.address, alice.address.toLowerCase());
  });

  it("registration binds the keys to the wallet with a signature anyone can check", async () => {
    const a = await vaultFor(alice);
    const draft = registrationDraft(a);
    const walletSig = await alice.signMessage({ message: registrationMessage(a.address, draft.sealPub, draft.signPub) });
    assert.ok(await verifyMessage({ address: alice.address, message: registrationMessage(a.address, draft.sealPub, draft.signPub), signature: walletSig }));
    assert.ok(matchesRegistration(a, draft));
    assert.ok(!matchesRegistration(await vaultFor(bob), draft));
  });
});

describe("sealed envelopes", () => {
  it("round-trip: recipient and sender both open it, nobody else", async () => {
    const a = await vaultFor(alice);
    const b = await vaultFor(bob);
    const env = seal(a, { to: bob.address, payload: invoice, recipientSealPub: registrationDraft(b).sealPub });
    assertEnvelopeShape(env);
    assert.equal(env.sealed, true);
    assert.equal(env.from, a.address);
    assert.equal(env.to, b.address);
    assert.deepEqual(Object.keys(env.keys).sort(), [a.address, b.address].sort());
    assert.ok(verifyEnvelope(env, registrationDraft(a).signPub));
    assert.ok(!verifyEnvelope(env, registrationDraft(b).signPub), "wrong sign key must not verify");
    assert.deepEqual(open(env, b), invoice);
    assert.deepEqual(open(env, a), invoice);
    const mallory = deriveVaultKeys("0x000000000000000000000000000000000000dead", `0x${"11".repeat(65)}`);
    assert.throws(() => open(env, mallory), /not sealed for this wallet/);
    assert.ok(!JSON.stringify(env).includes("Logo work"), "plaintext must not leak into the envelope");
  });

  it("a re-addressed, re-dated or edited envelope neither verifies nor opens", async () => {
    const a = await vaultFor(alice);
    const b = await vaultFor(bob);
    const env = seal(a, { to: bob.address, payload: invoice, recipientSealPub: registrationDraft(b).sealPub });
    const signPub = registrationDraft(a).signPub;

    const redated: SealedEnvelope = { ...env, createdAt: env.createdAt + 1 };
    assert.ok(!verifyEnvelope(redated, signPub));
    assert.throws(() => open(redated, b));

    const readdressed: SealedEnvelope = { ...env, to: a.address, keys: { [a.address]: env.keys[a.address] } };
    assert.ok(!verifyEnvelope(readdressed, signPub));
    assert.throws(() => open(readdressed, a));

    const ctBytes = Buffer.from(env.ct, "base64");
    ctBytes[3] ^= 0x01;
    const edited: SealedEnvelope = { ...env, ct: ctBytes.toString("base64") };
    assert.ok(!verifyEnvelope(edited, signPub));
    assert.throws(() => open(edited, b));
  });

  it("unsealed envelopes are signed and readable by anyone", async () => {
    const a = await vaultFor(alice);
    const env = compose(a, { to: bob.address, payload: { kind: "message", subject: "hi", body: "no vault yet?" } });
    assertEnvelopeShape(env);
    assert.equal(env.sealed, false);
    assert.ok(verifyEnvelope(env, registrationDraft(a).signPub));
    assert.equal(open(env, await vaultFor(bob)).body, "no vault yet?");
    const forged = { ...env, payload: { ...env.payload, body: "send me 1 ETH" } };
    assert.ok(!verifyEnvelope(forged, registrationDraft(a).signPub));
  });

  it("rejects malformed payloads and shapes", async () => {
    const a = await vaultFor(alice);
    const b = await vaultFor(bob);
    const sealPub = registrationDraft(b).sealPub;
    assert.throws(() => seal(a, { to: bob.address, payload: { ...invoice, amount: "-1" }, recipientSealPub: sealPub }), /positive/);
    assert.throws(() => seal(a, { to: bob.address, payload: { ...invoice, token: undefined }, recipientSealPub: sealPub }), /Token/);
    assert.throws(() => seal(a, { to: bob.address, payload: { kind: "message", subject: "x".repeat(200), body: "" }, recipientSealPub: sealPub }), /Subject/);
    const env = seal(a, { to: bob.address, payload: invoice, recipientSealPub: sealPub });
    assert.throws(() => assertEnvelopeShape({ ...env, keys: { [a.address]: env.keys[a.address] } }), /recipient/);
    assert.throws(() => assertEnvelopeShape({ ...env, from: alice.address }), /lowercase/);
    assert.throws(() => assertEnvelopeShape({ ...env, extra: 1 }), /Unexpected field/);
  });
});

describe("request authentication", () => {
  it("accepts a fresh signed request and refuses tampered or stale ones", async () => {
    const a = await vaultFor(alice);
    const registry = new Map([[a.address, registrationDraft(a).signPub]]);
    const lookup = (addr: string) => registry.get(addr as `0x${string}`) ?? null;
    const body = JSON.stringify({ hello: "world" });
    const headers = signRequest(a, "POST", "/api/messages?box=inbox", body);
    const h = new Headers(headers);
    assert.deepEqual(verifyRequest(h, "POST", "/api/messages?box=inbox", body, lookup), { ok: true, address: a.address });
    assert.equal(verifyRequest(h, "GET", "/api/messages?box=inbox", body, lookup).ok, false, "method is signed");
    assert.equal(verifyRequest(h, "POST", "/api/messages?box=sent", body, lookup).ok, false, "path is signed");
    assert.equal(verifyRequest(h, "POST", "/api/messages?box=inbox", body + " ", lookup).ok, false, "body is signed");
    assert.equal(verifyRequest(h, "POST", "/api/messages?box=inbox", body, lookup, Date.now() + 10 * 60 * 1000).ok, false, "stale");
    assert.equal(verifyRequest(h, "POST", "/api/messages?box=inbox", body, () => null).ok, false, "unknown wallet");
    const b = await vaultFor(bob);
    const forged = new Headers({ ...signRequest(b, "POST", "/api/messages?box=inbox", body), [AUTH_HEADERS.address]: a.address });
    assert.equal(verifyRequest(forged, "POST", "/api/messages?box=inbox", body, lookup).ok, false, "wrong key for address");
  });
});
