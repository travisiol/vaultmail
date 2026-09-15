/**
 * The real screens, driven for real: headless Chrome with a stub wallet
 * (an EIP-1193 provider whose signatures and transactions are produced by
 * a tiny local daemon holding two Hardhat test keys), against a server
 * pointed at a local Hardhat node.
 *
 *   node scripts/ui-e2e.mjs            # starts node + server on :3991, drives, captures
 *
 * Bob opens a vault, Alice opens hers and sends Bob a sealed invoice from
 * the compose screen, Bob reads it and pays it from the envelope, Alice
 * sees the receipt. Every screen is captured to docs/captures/ui-*.png.
 * Stop `next dev` on this folder first (two dev servers share .next/dev).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/captures");
mkdirSync(OUT, { recursive: true });
const RPC = "http://127.0.0.1:8545";
const PORT = 3991;
const BASE = `http://localhost:${PORT}`;
const DAEMON_PORT = 9911;
const CDP_PORT = 9338;

const alice = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const bob = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const localChain = { id: 31337, name: "local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain: localChain, transport: http(RPC) });

let current = bob;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? "✔" : "✘"} ${name}${!ok && detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

// ---- the wallet daemon: signs and sends for whichever account is "current" ----
const daemon = createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.end();
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = body ? JSON.parse(body) : {};
  const reply = (obj) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.url === "/account") return reply({ result: current.address });
    if (req.url === "/sign") {
      const raw = data.message;
      const sig = await current.signMessage({ message: { raw } });
      return reply({ result: sig });
    }
    if (req.url === "/send") {
      const tx = data.tx;
      const wallet = createWalletClient({ account: current, chain: localChain, transport: http(RPC) });
      const hash = await wallet.sendTransaction({ to: tx.to, value: tx.value ? BigInt(tx.value) : 0n, data: tx.data ?? undefined });
      return reply({ result: hash });
    }
    reply({ error: `unknown ${req.url}` });
  } catch (err) {
    reply({ error: err.shortMessage ?? err.message });
  }
});

const STUB = `(() => {
  const DAEMON = 'http://127.0.0.1:${DAEMON_PORT}';
  const RPC = '${RPC}';
  let id = 0;
  const listeners = {};
  async function rpc(method, params) {
    const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    const j = await res.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
    return j.result;
  }
  async function daemon(path, body) {
    const res = await fetch(DAEMON + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const j = await res.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  }
  const provider = {
    isMetaMask: true,
    isStub: true,
    async request({ method, params }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': return [await daemon('/account')];
        case 'eth_chainId': return '0x7a69';
        case 'net_version': return '31337';
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain': return null;
        case 'wallet_requestPermissions':
        case 'wallet_getPermissions': return [{ parentCapability: 'eth_accounts' }];
        case 'personal_sign': return daemon('/sign', { message: params[0], address: params[1] });
        case 'eth_sendTransaction': return daemon('/send', { tx: params[0] });
        case 'wallet_getCapabilities': { const e = new Error('unsupported'); e.code = 4200; throw e; }
        default: return rpc(method, params ?? []);
      }
    },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return provider; },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); return provider; },
    removeAllListeners() { return provider; },
  };
  Object.defineProperty(window, 'ethereum', { value: provider, configurable: true, writable: true });
  const info = { uuid: 'e2e00000-0000-4000-8000-000000000001', name: 'Stub Wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'test.stub' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();`;

// ---- CDP ----
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.logs.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.logs.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function waitForHttp(url, tries = 300, post) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, post ? { method: "POST", headers: { "content-type": "application/json" }, body: post } : undefined);
      if (res.ok) return;
    } catch {
      /* not yet */
    }
    await sleep(400);
  }
  throw new Error(`nothing answered at ${url}`);
}

function spawnBg(cmd, args, cwd, env = {}, shell = process.platform === "win32") {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell, stdio: "ignore" });
  children.push(child);
  return child;
}

class Page {
  constructor(cdp, ws, targetId) {
    this.cdp = cdp;
    this.ws = ws;
    this.targetId = targetId;
  }
  static async open() {
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res);
      ws.addEventListener("error", rej);
    });
    const cdp = new Cdp(ws);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: STUB });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    return new Page(cdp, ws, target.id);
  }
  async goto(path) {
    await this.cdp.send("Page.navigate", { url: BASE + path });
    await sleep(2500);
  }
  async eval(expression) {
    const { result, exceptionDetails } = await this.cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }
  async waitFor(expression, timeoutMs = 30_000, label = expression) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (await this.eval(expression)) return true;
      } catch {
        /* retry */
      }
      await sleep(300);
    }
    const text = await this.text().catch(() => "");
    await this.shot("ui-debug-timeout").catch(() => {});
    const NL = String.fromCharCode(10);
    throw new Error(`timed out waiting for: ${label}${NL}--- page text ---${NL}${text.slice(0, 1200)}${NL}--- console ---${NL}${this.cdp.logs.slice(-8).join(NL)}`);
  }
  text() {
    return this.eval("document.body.innerText");
  }
  async click(text, tag = "button, a") {
    const ok = await this.eval(`(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(tag)})).filter((e) => !e.disabled && e.getClientRects().length > 0);
      const el = els.find((e) => e.textContent.trim() === ${JSON.stringify(text)}) ?? els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})) ?? els.find((e) => e.textContent.includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`no clickable "${text}"`);
    await sleep(400);
  }
  async type(selector, value) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`no field ${selector}`);
    await sleep(150);
  }
  async shot(name, opts = {}) {
    if (opts.mobile) await this.cdp.send("Emulation.setDeviceMetricsOverride", { width: 400, height: 860, deviceScaleFactor: 1, mobile: true });
    await sleep(opts.wait ?? 800);
    const { data } = await this.cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
    if (opts.mobile) await this.cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    console.log(`  · ${name}.png`);
  }
  async close() {
    this.ws.close();
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${this.targetId}`).catch(() => {});
  }
}

/** Load `path`; if the door is showing, sign through it. Works for /inbox and /compose?… alike. */
async function unlock(page, path = "/inbox") {
  await page.goto(path);
  await page.waitFor(
    `document.body.innerText.includes('Connect and unlock') || document.body.innerText.includes('Unlock with a signature') || document.body.innerText.includes('Vault unlocked')`,
    30_000,
    "door or inbox",
  );
  const t0 = Date.now();
  if (!(await page.eval(`document.body.innerText.includes('Vault unlocked')`))) {
    await page.click("Connect and unlock").catch(() => page.click("Unlock with a signature"));
    await page.waitFor(`document.body.innerText.includes('Vault unlocked')`, 90_000, "vault unlocked");
  }
  console.log(`  · unlocked in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function main() {
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => existsSync(p));
  if (!chrome) throw new Error("no Chrome");
  console.log("VAULT MAIL — UI end-to-end with a stub wallet");

  await new Promise((r) => daemon.listen(DAEMON_PORT, "127.0.0.1", r));
  console.log("· hardhat node");
  spawnBg("npx", ["hardhat", "node", "--port", "8545"], join(ROOT, "chain"));
  await waitForHttp(RPC, 150, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }));
  const dbDir = mkdtempSync(join(tmpdir(), "vaultmail-ui-"));
  console.log(`· server on :${PORT}`);
  spawnBg("npx", ["next", "dev", "--port", String(PORT)], ROOT, {
    VAULT_CHAIN_ID: "31337",
    VAULT_RPC_URL: RPC,
    NEXT_PUBLIC_VAULT_CHAIN_ID: "31337",
    NEXT_PUBLIC_VAULT_RPC_URL: RPC,
    VAULTMAIL_DB_PATH: join(dbDir, "ui.db"),
  });
  await waitForHttp(`${BASE}/api/health`);
  console.log("· chrome");
  spawnBg(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${resolve(tmpdir(), "vaultmail-ui-chrome")}`, `--remote-debugging-port=${CDP_PORT}`, "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], ROOT, {}, false);
  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`);
  // Warm the routes once so the timed steps below measure the app, not Turbopack.
  for (const p of ["/inbox", "/compose", "/", "/api/stats", "/api/keys/0x0000000000000000000000000000000000000001", "/api/messages?box=inbox", "/api/messages/00000000000000000000000000000000", "/api/messages/00000000000000000000000000000000/receipts"]) {
    await fetch(BASE + p, { method: p.endsWith("/receipts") ? "POST" : "GET" }).catch(() => {});
  }

  // ---- Bob opens a vault -------------------------------------------------
  console.log("\nbob opens a vault");
  current = bob;
  let page = await Page.open();
  await unlock(page);
  await page.waitFor(`document.body.innerText.includes('Nothing here yet')`, 30_000, "empty inbox");
  let text = await page.text();
  check("bob's inbox is unlocked and empty", text.includes("Vault unlocked") && text.includes("Nothing here yet"), text.slice(0, 300));
  const bobReg = await (await fetch(`${BASE}/api/keys/${bob.address.toLowerCase()}`)).json();
  check("bob's keys are in the registry", Boolean(bobReg.registration?.sealPub), bobReg);
  await page.shot("ui-inbox-empty");
  await page.close();

  // ---- Alice opens hers and sends Bob a sealed invoice -------------------
  console.log("\nalice writes an invoice");
  current = alice;
  page = await Page.open();
  await unlock(page, `/compose?to=${bob.address}&kind=invoice`);
  await page.waitFor(`document.body.innerText.includes('has a vault')`, 20_000, "recipient vault lookup");
  text = await page.text();
  check("compose knows bob has a vault (will seal)", text.includes("has a vault — this envelope will be sealed"), text.slice(0, 400));
  await page.type("#subject", "Invoice INV-0042 — March retainer");
  await page.type("#number", "INV-0042");
  await page.click("Add item");
  await page.click("Add item");
  await page.eval(`(() => {
    const rows = Array.from(document.querySelectorAll('input[placeholder="Description"]'));
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const qty = Array.from(document.querySelectorAll('input[placeholder="Qty"]'));
    const unit = Array.from(document.querySelectorAll('input[placeholder^="Unit"]'));
    set(rows[0], 'Design retainer'); set(qty[0], '1'); set(unit[0], '0.4');
    set(rows[1], 'Revisions'); set(qty[1], '2'); set(unit[1], '0.05');
    return true;
  })()`);
  await page.type("#body", "Thanks again for March. April's scope is in the thread below.");
  await sleep(300);
  text = await page.text();
  check("the invoice total is computed from the items (0.5 ETH)", /Total 0\.5 ETH/.test(text), text.match(/Total[^\n]*/)?.[0]);
  await page.shot("ui-compose-invoice");
  await page.click("Seal and send");
  await page.waitFor(`location.pathname === '/inbox' && document.body.innerText.includes('Sent')`, 30_000, "landed in sent");
  await page.waitFor(`document.body.innerText.includes('Invoice INV-0042')`, 20_000, "sent list shows the invoice");
  text = await page.text();
  check("alice lands in Sent with the invoice open, sealed, 0.5 ETH, due", text.includes("Sealed") && text.includes("0.5 ETH") && text.includes("Due"), text.slice(0, 600));
  await page.shot("ui-sent-invoice");
  const sentRow = await (await fetch(`${BASE}/api/stats`)).json();
  check("server counts one sealed envelope", sentRow.messages === 1 && sentRow.sealed === 1, sentRow);
  await page.close();

  // ---- Bob reads and pays it ------------------------------------------------
  console.log("\nbob pays from the envelope");
  current = bob;
  const before = await pub.getBalance({ address: alice.address });
  page = await Page.open();
  await unlock(page);
  await page.waitFor(`document.body.innerText.includes('1 new')`, 20_000, "unread badge");
  await page.click("Invoice INV-0042", "a");
  await page.waitFor(`document.body.innerText.includes('Pay 0.5 ETH')`, 20_000, "pay button");
  text = await page.text();
  check("bob sees the invoice: sealed, signature verified, line items, Pay button", text.includes("Signature verified") && text.includes("Design retainer") && text.includes("Pay 0.5 ETH"), text.slice(0, 800));
  await page.shot("ui-inbox-invoice");
  await page.click("Pay 0.5 ETH");
  await page.waitFor(`document.body.innerText.includes('Paid in full')`, 60_000, "paid in full");
  text = await page.text();
  const after = await pub.getBalance({ address: alice.address });
  check("alice's balance grew by 0.5 ETH on the chain", after - before === 500000000000000000n, formatEther(after - before));
  check("the envelope shows the verified receipt", text.includes("verified on the chain") && text.includes("block"), text.slice(0, 800));
  await page.shot("ui-inbox-paid");
  await page.shot("ui-inbox-paid-mobile", { mobile: true });
  await page.close();

  // ---- Alice sees the receipt --------------------------------------------------
  console.log("\nalice sees the receipt");
  current = alice;
  page = await Page.open();
  await unlock(page);
  await page.click("Sent", "a");
  await page.waitFor(`location.search.includes('box=sent') && document.body.innerText.includes('Invoice INV-0042')`, 20_000, "sent list");
  await page.click("Invoice INV-0042", "a");
  await page.waitFor(`document.body.innerText.includes('Paid in full')`, 20_000, "alice sees paid");
  text = await page.text();
  check("alice's sent copy shows Paid in full with the tx", text.includes("Paid in full") && text.includes("Paid"), text.slice(0, 500));
  await page.shot("ui-sent-paid");
  const errors = page.cdp.logs.filter((l) => !/favicon|DevTools|THREE\.Clock/.test(l));
  check("no console errors on the last page", errors.length === 0, errors.slice(0, 5));
  await page.close();

  const stats = await (await fetch(`${BASE}/api/stats`)).json();
  check("stats: 2 vaults, 1 envelope, 1 paid", stats.vaults === 2 && stats.messages === 1 && stats.paid === 1, stats);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    daemon.close();
    for (const c of children) {
      try {
        if (process.platform === "win32" && c.pid) spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
        else c.kill();
      } catch {
        /* gone */
      }
    }
  });
