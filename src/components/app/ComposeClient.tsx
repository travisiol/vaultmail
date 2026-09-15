"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { erc20Abi } from "viem";
import { usePublicClient } from "wagmi";
import { AppShell } from "@/components/app/AppShell";
import { Identicon } from "@/components/Identicon";
import { useVault } from "@/components/vault/VaultProvider";
import { chain } from "@/lib/chain";
import { api } from "@/lib/client/api";
import { useLocationSearch } from "@/lib/client/location";
import { useInvalidateMail, useVaultOf } from "@/lib/client/mail";
import { asAddress, checksum, formatAmount, shortAddress } from "@/lib/format";
import { assertPayload, compose, seal } from "@/lib/protocol/envelope";
import { LIMITS, type Address, type LineItem, type MessageKind, type Payload, type TokenRef } from "@/lib/protocol/types";

/**
 * Writing an envelope. The recipient's registry entry decides how it goes:
 * a vault → sealed to it; none → sent unsealed, with the warning in the
 * button itself, not in a tooltip.
 */
const KINDS: { key: MessageKind; label: string; hint: string }[] = [
  { key: "message", label: "Message", hint: "Words only." },
  { key: "invoice", label: "Invoice", hint: "Line items, a number, a due date." },
  { key: "request", label: "Payment request", hint: "An amount and why." },
];

const NATIVE: TokenRef = { kind: "native", symbol: chain.nativeCurrency.symbol, decimals: chain.nativeCurrency.decimals };

function useTokenInfo(address: Address | null) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["erc20", chain.id, address ?? ""],
    enabled: Boolean(address && client),
    staleTime: Infinity,
    queryFn: async (): Promise<TokenRef> => {
      const [symbol, decimals] = await Promise.all([
        client!.readContract({ address: address!, abi: erc20Abi, functionName: "symbol" }),
        client!.readContract({ address: address!, abi: erc20Abi, functionName: "decimals" }),
      ]);
      return { kind: "erc20", address: address!, symbol, decimals };
    },
  });
}

export function ComposeClient() {
  const router = useRouter();
  const { keys } = useVault();
  const sp = useLocationSearch();
  const invalidate = useInvalidateMail(keys);

  const [to, setTo] = useState("");
  const [kind, setKind] = useState<MessageKind>("message");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [number, setNumber] = useState("");
  const [due, setDue] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [tokenMode, setTokenMode] = useState<"native" | "erc20">("native");
  const [tokenAddress, setTokenAddress] = useState("");
  const [re, setRe] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the URL (reply, vault page, hero field): state adjusted
  // during render when the search string changes, never in an effect.
  const search = sp.toString();
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (seededFrom !== search) {
    setSeededFrom(search);
    const qTo = sp.get("to");
    const qKind = sp.get("kind");
    const qSubject = sp.get("subject");
    const qRe = sp.get("re");
    if (qTo) setTo(qTo);
    if (qKind === "invoice" || qKind === "request" || qKind === "message") setKind(qKind);
    if (qSubject) setSubject(qSubject);
    if (qRe && /^[0-9a-f]{32}$/.test(qRe)) setRe(qRe);
  }

  const target = asAddress(to);
  const recipient = useVaultOf(target);
  const erc20 = useTokenInfo(tokenMode === "erc20" ? asAddress(tokenAddress) : null);
  const token: TokenRef | null = tokenMode === "native" ? NATIVE : (erc20.data ?? null);

  const itemsTotal = useMemo(() => items.reduce((s, it) => s + (Number(it.unit) || 0) * (Number(it.qty) || 0), 0), [items]);
  const effectiveAmount = kind === "invoice" && items.length ? trim(itemsTotal) : amount;

  const payload = useMemo<Payload | null>(() => {
    const p: Payload = { kind, subject: subject.trim(), body: body.trim() };
    if (kind !== "message") {
      p.amount = effectiveAmount.trim();
      p.token = token ?? undefined;
      if (due) p.due = new Date(due).getTime();
      if (kind === "invoice") {
        if (number.trim()) p.number = number.trim();
        if (items.length) p.items = items.map((it) => ({ label: it.label.trim(), qty: Number(it.qty) || 0, unit: String(it.unit).trim() }));
      }
    }
    if (re) p.re = re;
    return p;
  }, [kind, subject, body, effectiveAmount, token, due, number, items, re]);

  const problem = useMemo(() => {
    if (!target) return "Enter the recipient's address.";
    if (!payload) return "…";
    try {
      assertPayload(payload);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [target, payload]);

  const send = async () => {
    if (!keys || !target || !payload || problem) return;
    setError(null);
    setSending(true);
    try {
      const reg = recipient.data ?? null;
      const env = reg ? seal(keys, { to: target, payload, recipientSealPub: reg.sealPub }) : compose(keys, { to: target, payload });
      await api.send(keys, env);
      invalidate();
      router.push(`/inbox?box=sent&id=${env.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  };

  const recipientState = !target ? null : recipient.isLoading ? "checking" : recipient.data ? "sealed" : "open";

  return (
    <AppShell>
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-5 py-6 md:px-8 md:py-8">
          <h1 className="text-[22px]">{re ? "Reply" : "New envelope"}</h1>

          {/* to */}
          <div className="mt-6">
            <label className="label" htmlFor="to">
              To
            </label>
            <div className="flex items-center gap-3">
              {target ? <Identicon address={target} size={36} /> : <span className="inline-block h-9 w-9 rounded-full border border-dashed border-[var(--rim)]" />}
              <input id="to" className="field field-mono" placeholder="0x… wallet address" value={to} onChange={(e) => setTo(e.target.value)} spellCheck={false} autoComplete="off" />
            </div>
            <p className={clsx("mt-2 min-h-[18px] text-[12.5px]", recipientState === "open" ? "text-ink-1" : "text-ink-3")}>
              {recipientState === "checking" && "Looking up their vault…"}
              {recipientState === "sealed" && (
                <>
                  <span className="dot dot-live mr-1.5 inline-block align-middle" />
                  {shortAddress(target!)} has a vault — this envelope will be sealed to it.
                </>
              )}
              {recipientState === "open" && `${shortAddress(target!)} has not opened a vault. The envelope will be sent unsealed — readable by the server — and marked as such.`}
              {to && !target && "That is not a wallet address."}
            </p>
          </div>

          {/* kind */}
          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={clsx("glass glass-quiet rounded-[14px] px-4 py-3 text-left transition-colors", kind === k.key ? "glass-lit" : "hover:bg-white/[0.05]")}
                aria-pressed={kind === k.key}
              >
                <span className="block text-[14px] font-medium text-ink-0">{k.label}</span>
                <span className="block text-[12.5px] text-ink-3">{k.hint}</span>
              </button>
            ))}
          </div>

          {/* subject */}
          <div className="mt-6">
            <label className="label" htmlFor="subject">
              Subject
            </label>
            <input id="subject" className="field" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={LIMITS.subjectChars} placeholder={kind === "invoice" ? "March retainer" : kind === "request" ? "Venue deposit" : "What is this about"} />
          </div>

          {/* money */}
          {kind !== "message" && (
            <div className="glass glass-quiet mt-6 rounded-[16px] p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="label">Token</span>
                  <div className="flex gap-2">
                    <button type="button" className={clsx("btn btn-sm", tokenMode === "native" ? "btn-glass" : "btn-ghost")} onClick={() => setTokenMode("native")}>
                      {NATIVE.symbol}
                    </button>
                    <button type="button" className={clsx("btn btn-sm", tokenMode === "erc20" ? "btn-glass" : "btn-ghost")} onClick={() => setTokenMode("erc20")}>
                      ERC-20
                    </button>
                  </div>
                  {tokenMode === "erc20" && (
                    <div className="mt-2">
                      <input className="field field-mono" placeholder="0x… token contract" value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} spellCheck={false} />
                      <p className="mt-1.5 min-h-[16px] text-[12px] text-ink-3">
                        {erc20.isLoading && "Reading the token…"}
                        {erc20.data && erc20.data.kind === "erc20" && `${erc20.data.symbol} · ${erc20.data.decimals} decimals · ${checksum(erc20.data.address)}`}
                        {erc20.error && "Could not read symbol/decimals at that address on this chain."}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="amount">
                    {kind === "invoice" && items.length ? "Total (from the items)" : "Amount"}
                  </label>
                  <input
                    id="amount"
                    className="field num"
                    inputMode="decimal"
                    placeholder="0.25"
                    value={kind === "invoice" && items.length ? trim(itemsTotal) : amount}
                    onChange={(e) => setAmount(e.target.value.replace(",", "."))}
                    readOnly={kind === "invoice" && items.length > 0}
                  />
                </div>
                {kind === "invoice" && (
                  <>
                    <div>
                      <label className="label" htmlFor="number">
                        Invoice number <span className="text-ink-3">(optional)</span>
                      </label>
                      <input id="number" className="field num" placeholder="INV-0042" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} />
                    </div>
                  </>
                )}
                <div>
                  <label className="label" htmlFor="due">
                    Due date <span className="text-ink-3">(optional)</span>
                  </label>
                  <input id="due" type="date" className="field num" value={due} onChange={(e) => setDue(e.target.value)} />
                </div>
              </div>

              {kind === "invoice" && (
                <div className="mt-5 border-t border-[var(--line)] pt-4">
                  <div className="flex items-center justify-between">
                    <span className="label mb-0">Line items</span>
                    <button type="button" className="btn btn-xs btn-glass" disabled={items.length >= LIMITS.items} onClick={() => setItems((l) => [...l, { label: "", qty: 1, unit: "" }])}>
                      Add item
                    </button>
                  </div>
                  {items.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {items.map((it, i) => (
                        <div key={i} className="grid grid-cols-[1fr_72px_110px_32px] items-center gap-2">
                          <input className="field !min-h-[40px] !py-2 text-[14px]" placeholder="Description" value={it.label} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                          <input className="field num !min-h-[40px] !py-2 text-[14px]" inputMode="numeric" placeholder="Qty" value={it.qty} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) || 0 } : x)))} />
                          <input className="field num !min-h-[40px] !py-2 text-[14px]" inputMode="decimal" placeholder={`Unit ${token?.symbol ?? ""}`} value={it.unit} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, unit: e.target.value.replace(",", ".") } : x)))} />
                          <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-white/[0.06] hover:text-ink-0" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="Remove item">
                            ×
                          </button>
                        </div>
                      ))}
                      <p className="num pt-1 text-right text-[13px] text-ink-1">
                        Total {token ? formatAmount(trim(itemsTotal), token) : trim(itemsTotal)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* body */}
          <div className="mt-6">
            <label className="label" htmlFor="body">
              {kind === "message" ? "Message" : "Note"}
            </label>
            <textarea id="body" className="field" rows={kind === "message" ? 9 : 5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.bodyChars} placeholder={kind === "message" ? "Write…" : "What this is for, terms, anything they should know."} />
            <p className="num mt-1 text-right text-[11.5px] text-ink-3">
              {body.length.toLocaleString("en-US")} / {LIMITS.bodyChars.toLocaleString("en-US")}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className={clsx("btn", recipientState === "open" ? "btn-glass" : "btn-mint")} disabled={Boolean(problem) || sending || recipientState === "checking"} onClick={() => void send()}>
              {sending && <span className="h-4 w-4 animate-[spin_0.9s_linear_infinite] rounded-full border-2 border-current/20 border-t-current" />}
              {sending ? "Sealing and sending…" : recipientState === "open" ? "Send unsealed" : "Seal and send"}
            </button>
            <span className="text-[13px] text-ink-3">{problem && target ? problem : ""}</span>
          </div>
          {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
        </div>
      </div>
    </AppShell>
  );
}

function trim(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(8).replace(/\.?0+$/, "");
}
