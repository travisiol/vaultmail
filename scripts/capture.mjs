/**
 * Screenshots of the running site with headless Chrome, driven over the
 * DevTools protocol (Node's built-in WebSocket, no dependency):
 *
 *   node scripts/capture.mjs [base=http://localhost:3990] [outDir=docs/captures]
 *   ONLY=hero,inbox node scripts/capture.mjs      # a subset
 *   SHOT=/lab/glass?v=base WAIT=12000 node scripts/capture.mjs   # one ad-hoc page → docs/captures/shot.png
 *
 * SwiftShader renders WebGL without a GPU, so the glass hero appears. Device
 * metrics are emulated per shot (Chrome refuses windows narrower than
 * ~500 px, so phone widths need the emulation), and each shot waits real
 * seconds for fonts and the scene.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const base = process.argv[2] ?? "http://localhost:3990";
const out = resolve(process.argv[3] ?? "docs/captures");
mkdirSync(out, { recursive: true });
const only = process.env.ONLY?.split(",");
const wait = Number(process.env.WAIT ?? 9000);

const CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error("no Chrome found");

const shots = process.env.SHOT
  ? [{ name: process.env.NAME ?? "shot", path: process.env.SHOT, w: Number(process.env.W ?? 1440), h: Number(process.env.H ?? 900), full: process.env.FULL === "1", mobile: process.env.MOBILE === "1" }]
  : [
      { name: "hero", path: "/", w: 1440, h: 900 },
      { name: "landing-full", path: "/", w: 1440, h: 900, full: true },
      { name: "protocol", path: "/protocol", w: 1440, h: 900, full: true },
      { name: "inbox-locked", path: "/inbox", w: 1440, h: 900 },
      { name: "mobile-hero", path: "/", w: 400, h: 860, mobile: true },
      { name: "mobile-landing-full", path: "/", w: 400, h: 860, mobile: true, full: true },
    ].filter((s) => !only || only.includes(s.name));

const PORT = 9337;
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${resolve(tmpdir(), "vaultmail-capture")}`,
    `--remote-debugging-port=${PORT}`,
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--hide-scrollbars",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("chrome did not start");
}

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
      } else if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
        this.logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
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

async function connect() {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  return { cdp: new Cdp(ws), ws, targetId: target.id };
}

try {
  await waitForChrome();
  for (const s of shots) {
    const { cdp, ws, targetId } = await connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: Boolean(s.mobile) });
    await cdp.send("Page.navigate", { url: base + s.path });
    await sleep(wait);
    let clip;
    if (s.full) {
      // Reveal everything that waits for a scroll, then size the viewport to the page.
      await cdp.send("Runtime.evaluate", { expression: `document.querySelectorAll('.reveal').forEach(e => e.classList.add('is-in'))` });
      // Keep the viewport as it is (100svh sections must stay one screen tall) and capture beyond it.
      const { contentSize } = await cdp.send("Page.getLayoutMetrics");
      const height = Math.min(Math.ceil(contentSize.height), 12000);
      await sleep(1500);
      clip = { x: 0, y: 0, width: s.w, height, scale: 1 };
    }
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: Boolean(s.full), ...(clip ? { clip } : {}) });
    writeFileSync(resolve(out, `${s.name}.png`), Buffer.from(data, "base64"));
    console.log(`${s.name}.png${cdp.logs.length ? `\n  ${cdp.logs.slice(0, 8).join("\n  ")}` : ""}`);
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${targetId}`).catch(() => {});
  }
} finally {
  proc.kill();
}
