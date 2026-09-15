/**
 * End to end, for real: a local Hardhat node, a VAULT MAIL server pointed at
 * it, and two throwaway wallets that open vaults, write to each other, and
 * pay an invoice in ETH and a request in an ERC-20 — with every refusal the
 * API is supposed to make, made.
 *
 *   npm run e2e                 # starts the node and a server on :3991
 *   E2E_BASE=http://localhost:3991 E2E_RPC=http://127.0.0.1:8545 npm run e2e   # reuse running ones
 *
 * Stop `next dev` on this folder first: two dev servers share `.next/dev`.
 * The server gets a fresh temp database; nothing touches ./data.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, erc20Abi, http, parseEther, parseUnits, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signRequest } from "../src/lib/protocol/auth";
import { compose, open, seal, verifyEnvelope } from "../src/lib/protocol/envelope";
import { deriveVaultKeys, registrationDraft, registrationMessage, unlockMessage, type VaultKeys } from "../src/lib/protocol/keys";
import type { Envelope, Payload, Registration, StoredMessage } from "../src/lib/protocol/types";

const ROOT = resolve(import.meta.dirname, "..");
const RPC = process.env.E2E_RPC ?? "http://127.0.0.1:8545";
const PORT = Number(process.env.E2E_PORT ?? 3991);
const BASE = process.env.E2E_BASE ?? `http://localhost:${PORT}`;

// Hardhat's well-known funded accounts (#0, #1, #2). Never real money.
const alice = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const bob = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const mallory = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

const localChain = { id: 31337, name: "local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const pub = createPublicClient({ chain: localChain, transport: http(RPC) });
const wallet = (account: typeof alice) => createWalletClient({ account, chain: localChain, transport: http(RPC) });

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✘ ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}

type Res<T> = { status: number; body: T };
async function call<T = Record<string, unknown>>(keys: VaultKeys | null, method: string, path: string, body?: unknown): Promise<Res<T>> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (keys) Object.assign(headers, signRequest(keys, method, path, raw));
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : raw });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as T };
}

async function vaultFor(account: typeof alice): Promise<VaultKeys> {
  const sig = await account.signMessage({ message: unlockMessage(account.address) });
  return deriveVaultKeys(account.address, sig);
}

async function register(account: typeof alice, keys: VaultKeys) {
  const draft = registrationDraft(keys);
  const walletSig = await account.signMessage({ message: registrationMessage(keys.address, draft.sealPub, draft.signPub) });
  return call<{ registration: Registration; replaced: boolean; error?: string }>(null, "POST", "/api/keys", { ...draft, walletSig });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url: string, label: string, tries = 150) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { method: url === RPC ? "POST" : "GET", headers: { "content-type": "application/json" }, body: url === RPC ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) : undefined });
      if (res.ok) return;
    } catch {
      /* not yet */
    }
    await sleep(400);
  }
  throw new Error(`${label} did not come up at ${url}`);
}

const children: ChildProcess[] = [];
function spawnLogged(cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(d));
  child.stderr?.on("data", (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
  children.push(child);
  return child;
}

async function main() {
  console.log("VAULT MAIL end-to-end");
  if (!process.env.E2E_RPC) {
    console.log("· starting hardhat node");
    spawnLogged("npx", ["hardhat", "node", "--port", "8545"], join(ROOT, "chain"));
  }
  await waitFor(RPC, "hardhat node");

  if (!process.env.E2E_BASE) {
    const dbDir = mkdtempSync(join(tmpdir(), "vaultmail-e2e-"));
    console.log(`· starting server on :${PORT} (db ${dbDir})`);
    spawnLogged("npx", ["next", "dev", "--port", String(PORT)], ROOT, {
      VAULT_CHAIN_ID: "31337",
      VAULT_RPC_URL: RPC,
      NEXT_PUBLIC_VAULT_CHAIN_ID: "31337",
      NEXT_PUBLIC_VAULT_RPC_URL: RPC,
      VAULTMAIL_DB_PATH: join(dbDir, "e2e.db"),
    });
  }
  await waitFor(`${BASE}/api/health`, "server", 300);

  console.log("\nhealth");
  const health = await call<{ ok: boolean; chainId: number }>(null, "GET", "/api/health");
  check("server is up and on the local chain", health.status === 200 && health.body.chainId === 31337, health.body);

  console.log("\nregistry");
  const A = await vaultFor(alice);
  const B = await vaultFor(bob);
  const M = await vaultFor(mallory);
  const regA = await register(alice, A);
  check("alice registers (201)", regA.status === 201 && regA.body.registration.address === A.address, regA.body);
  const regA2 = await register(alice, A);
  check("registering again is a no-op (200, not replaced)", regA2.status === 200 && regA2.body.replaced === false, regA2.body);
  const draftB = registrationDraft(B);
  const forged = await call<{ error: string }>(null, "POST", "/api/keys", { ...draftB, walletSig: regA.body.registration.walletSig });
  check("a registration with someone else's signature is refused (401)", forged.status === 401, forged.body);
  const lookupA = await call<{ registration: Registration }>(null, "GET", `/api/keys/${A.address}`);
  check("anyone can read alice's keys", lookupA.status === 200 && lookupA.body.registration.sealPub === registrationDraft(A).sealPub);
  const lookupB = await call<{ error: string }>(null, "GET", `/api/keys/${B.address}`);
  check("bob has no vault yet (404)", lookupB.status === 404);

  console.log("\nunsealed mail to a wallet without a vault");
  const hello: Payload = { kind: "message", subject: "Are you there?", body: "Open a vault and I can seal these." };
  const openEnv = compose(A, { to: bob.address, payload: hello });
  const sentOpen = await call<{ id: string; sealed: boolean }>(A, "POST", "/api/messages", { envelope: openEnv });
  check("alice → bob unsealed is accepted (201, sealed:false)", sentOpen.status === 201 && sentOpen.body.sealed === false, sentOpen.body);
  const wrongSeal = seal(A, { to: bob.address, payload: hello, recipientSealPub: registrationDraft(M).sealPub });
  const sealedToNobody = await call<{ error: string }>(A, "POST", "/api/messages", { envelope: wrongSeal });
  check("a sealed envelope to a wallet without a vault is refused (409)", sealedToNobody.status === 409, sealedToNobody.body);
  const unsigned = await call<{ error: string }>(null, "POST", "/api/messages", { envelope: openEnv });
  check("sending without vault headers is refused (401)", unsigned.status === 401);
  const asMallory = await call<{ error: string }>(M, "POST", "/api/messages", { envelope: openEnv });
  check("mallory cannot post an envelope signed by alice (401 — no vault / wrong signer)", asMallory.status === 401 || asMallory.status === 403, asMallory.body);

  console.log("\nbob opens a vault; sealed mail");
  const regB = await register(bob, B);
  check("bob registers (201)", regB.status === 201);
  const regM = await register(mallory, M);
  check("mallory registers (201)", regM.status === 201);
  const downgrade = await call<{ error: string }>(A, "POST", "/api/messages", { envelope: compose(A, { to: bob.address, payload: hello }) });
  check("an unsealed envelope to a wallet WITH a vault is refused (409)", downgrade.status === 409, downgrade.body);

  const invoice: Payload = {
    kind: "invoice",
    subject: "Invoice INV-0042 — March retainer",
    body: "Thanks for March.",
    amount: "0.5",
    token: { kind: "native", symbol: "ETH", decimals: 18 },
    number: "INV-0042",
    items: [
      { label: "Design retainer", qty: 1, unit: "0.4" },
      { label: "Revisions", qty: 2, unit: "0.05" },
    ],
  };
  const invEnv = seal(A, { to: bob.address, payload: invoice, recipientSealPub: regB.body.registration.sealPub });
  const sentInv = await call<{ id: string; sealed: boolean }>(A, "POST", "/api/messages", { envelope: invEnv });
  check("alice → bob sealed invoice accepted (201, sealed:true)", sentInv.status === 201 && sentInv.body.sealed === true, sentInv.body);
  const dup = await call<{ inserted: boolean }>(A, "POST", "/api/messages", { envelope: invEnv });
  check("re-sending the same envelope id is idempotent (200, inserted:false)", dup.status === 200 && dup.body.inserted === false, dup.body);
  const tampered: Envelope = { ...invEnv, createdAt: invEnv.createdAt + 1 };
  const tamperedRes = await call<{ error: string }>(A, "POST", "/api/messages", { envelope: tampered });
  check("a re-dated envelope fails its signature check (401)", tamperedRes.status === 401, tamperedRes.body);
  const mSealed = seal(M, { to: bob.address, payload: hello, recipientSealPub: regB.body.registration.sealPub });
  const spoofed: Envelope = { ...mSealed, from: A.address, keys: { [B.address]: mSealed.keys[B.address], [A.address]: mSealed.keys[M.address] } };
  const spoofedRes = await call<{ error: string }>(M, "POST", "/api/messages", { envelope: spoofed });
  check("mallory cannot post an envelope claiming to be from alice (403)", spoofedRes.status === 403, spoofedRes.body);

  // An ERC-20 for the request: deploy MockUSD, mint bob some.
  const artifact = JSON.parse(readFileSync(join(ROOT, "chain", "artifacts", "contracts", "MockUSD.sol", "MockUSD.json"), "utf8")) as { abi: Abi; bytecode: Hex };
  const deployHash = await wallet(alice).deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
  const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const musd = deployReceipt.contractAddress!;
  const mintHash = await wallet(alice).writeContract({ address: musd, abi: [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address", name: "to" }, { type: "uint256", name: "amount" }], outputs: [] }], functionName: "mint", args: [bob.address, parseUnits("1000", 6)] });
  await pub.waitForTransactionReceipt({ hash: mintHash });
  const request: Payload = { kind: "request", subject: "Venue deposit", body: "Half now, half after.", amount: "25", token: { kind: "erc20", address: musd.toLowerCase() as `0x${string}`, symbol: "mUSD", decimals: 6 } };
  const reqEnv = seal(A, { to: bob.address, payload: request, recipientSealPub: regB.body.registration.sealPub });
  const sentReq = await call<{ id: string }>(A, "POST", "/api/messages", { envelope: reqEnv });
  check("alice → bob sealed mUSD request accepted (201)", sentReq.status === 201, sentReq.body);

  console.log("\nreading");
  const inboxB = await call<{ messages: StoredMessage[] }>(B, "GET", "/api/messages?box=inbox");
  check("bob's inbox has 3 envelopes", inboxB.status === 200 && inboxB.body.messages.length === 3, inboxB.body);
  const byId = new Map(inboxB.body.messages.map((m) => [m.envelope.id, m]));
  const gotInv = byId.get(invEnv.id)!;
  const gotReq = byId.get(reqEnv.id)!;
  const gotOpen = byId.get(openEnv.id)!;
  check("the unsealed message reads as sent", gotOpen && !gotOpen.envelope.sealed && open(gotOpen.envelope, B).body === hello.body);
  check("bob opens the invoice and sees 0.5 ETH", gotInv && open(gotInv.envelope, B).amount === "0.5");
  check("bob opens the request and sees 25 mUSD", gotReq && open(gotReq.envelope, B).amount === "25" && open(gotReq.envelope, B).token?.symbol === "mUSD");
  check("the stored envelope does not contain the plaintext", !JSON.stringify(gotInv.envelope).includes("March retainer"));
  check("signatures verify against alice's published key", verifyEnvelope(gotInv.envelope, lookupA.body.registration.signPub) && verifyEnvelope(gotOpen.envelope, lookupA.body.registration.signPub));
  check("…and not against bob's", !verifyEnvelope(gotInv.envelope, regB.body.registration.signPub));
  let malloryOpened = false;
  try {
    open(gotInv.envelope, M);
    malloryOpened = true;
  } catch {
    /* expected */
  }
  check("mallory cannot open bob's invoice even with the ciphertext", !malloryOpened);
  const sentA = await call<{ messages: StoredMessage[] }>(A, "GET", "/api/messages?box=sent");
  check("alice's sent box has 3 envelopes and she can open her own sealed invoice", sentA.body.messages.length === 3 && open(sentA.body.messages.find((m) => m.envelope.id === invEnv.id)!.envelope, A).amount === "0.5");
  const inboxNoAuth = await call<{ error: string }>(null, "GET", "/api/messages?box=inbox");
  check("listing without headers is refused (401)", inboxNoAuth.status === 401);
  const badSig = await call<{ error: string }>({ ...B, sign: M.sign }, "GET", "/api/messages?box=inbox");
  check("listing with the wrong sign key is refused (401)", badSig.status === 401, badSig.body);
  const peek = await call<{ error: string }>(M, "GET", `/api/messages/${invEnv.id}`);
  check("mallory cannot fetch bob's envelope by id (404)", peek.status === 404);
  const readRes = await call<{ read: boolean }>(B, "PATCH", `/api/messages/${invEnv.id}`, {});
  check("bob marks the invoice read", readRes.status === 200 && readRes.body.read === true);
  const readByAlice = await call<{ error: string }>(A, "PATCH", `/api/messages/${invEnv.id}`, {});
  check("alice cannot mark bob's copy read (404)", readByAlice.status === 404);

  console.log("\npaying");
  const payHash = await wallet(bob).sendTransaction({ to: alice.address, value: parseEther("0.5") });
  await pub.waitForTransactionReceipt({ hash: payHash });
  const rcpt = await call<{ receipt: { token: string; amount: string; payer: string; payee: string }; inserted: boolean; error?: string }>(B, "POST", `/api/messages/${invEnv.id}/receipts`, { txHash: payHash });
  check("bob pays 0.5 ETH and the receipt is verified and attached (201)", rcpt.status === 201 && rcpt.body.receipt.token === "native" && rcpt.body.receipt.amount === parseEther("0.5").toString() && rcpt.body.receipt.payee === A.address, rcpt.body);
  const rcptAgain = await call<{ inserted: boolean }>(B, "POST", `/api/messages/${invEnv.id}/receipts`, { txHash: payHash });
  check("attaching the same transaction again is idempotent (200)", rcptAgain.status === 200 && rcptAgain.body.inserted === false);
  const reuse = await call<{ error: string }>(B, "POST", `/api/messages/${reqEnv.id}/receipts`, { txHash: payHash });
  check("one transaction cannot pay a second envelope (409)", reuse.status === 409, reuse.body);

  const payTokenHash = await wallet(bob).writeContract({ address: musd, abi: erc20Abi, functionName: "transfer", args: [alice.address, parseUnits("25", 6)] });
  await pub.waitForTransactionReceipt({ hash: payTokenHash });
  const rcptToken = await call<{ receipt: { token: string; amount: string } }>(B, "POST", `/api/messages/${reqEnv.id}/receipts`, { txHash: payTokenHash });
  check("bob pays 25 mUSD and the ERC-20 receipt is verified (201)", rcptToken.status === 201 && rcptToken.body.receipt.token === musd.toLowerCase() && rcptToken.body.receipt.amount === "25000000", rcptToken.body);

  const strayHash = await wallet(bob).sendTransaction({ to: mallory.address, value: parseEther("0.1") });
  await pub.waitForTransactionReceipt({ hash: strayHash });
  const stray = await call<{ error: string }>(B, "POST", `/api/messages/${openEnv.id}/receipts`, { txHash: strayHash });
  check("a transfer to someone else is not a receipt (422)", stray.status === 422, stray.body);
  const fromMallory = await wallet(mallory).sendTransaction({ to: alice.address, value: parseEther("0.5") });
  await pub.waitForTransactionReceipt({ hash: fromMallory });
  const notPayer = await call<{ error: string }>(B, "POST", `/api/messages/${openEnv.id}/receipts`, { txHash: fromMallory });
  check("a transfer from another wallet is not bob's receipt (403)", notPayer.status === 403, notPayer.body);
  const byAlice = await call<{ error: string }>(A, "POST", `/api/messages/${invEnv.id}/receipts`, { txHash: payHash });
  check("the sender cannot attach receipts to her own invoice (404)", byAlice.status === 404);
  const ghost = await call<{ error: string }>(B, "POST", `/api/messages/${openEnv.id}/receipts`, { txHash: `0x${"ab".repeat(32)}` });
  check("an unknown transaction hash is refused (404)", ghost.status === 404, ghost.body);

  const sentAfter = await call<{ messages: StoredMessage[] }>(A, "GET", "/api/messages?box=sent");
  const invAfter = sentAfter.body.messages.find((m) => m.envelope.id === invEnv.id)!;
  check("alice sees the ETH receipt on her invoice", invAfter.receipts.length === 1 && invAfter.receipts[0].txHash === payHash.toLowerCase());
  const inboxAfter = await call<{ messages: StoredMessage[] }>(B, "GET", "/api/messages?box=inbox");
  check("bob sees the invoice as read with its receipt", inboxAfter.body.messages.find((m) => m.envelope.id === invEnv.id)!.readAt !== null && inboxAfter.body.messages.find((m) => m.envelope.id === reqEnv.id)!.receipts.length === 1);

  console.log("\nstats");
  const stats = await call<{ vaults: number; messages: number; sealed: number; paid: number }>(null, "GET", "/api/stats");
  check("3 vaults, 3 envelopes, 2 sealed, 2 paid", stats.body.vaults === 3 && stats.body.messages === 3 && stats.body.sealed === 2 && stats.body.paid === 2, stats.body);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const c of children) {
      try {
        if (process.platform === "win32" && c.pid) spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
        else c.kill();
      } catch {
        /* gone */
      }
    }
  });
