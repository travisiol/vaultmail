"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Identicon } from "@/components/Identicon";
import { KindChip } from "@/components/mail/KindChip";
import { StateChip } from "@/components/mail/MailList";
import { PayButton } from "@/components/mail/PayButton";
import { useVault } from "@/components/vault/VaultProvider";
import { explorerTx } from "@/lib/chain";
import { useMarkRead, type Box, type OpenedMessage } from "@/lib/client/mail";
import { checksum, dateLabel, dayLabel, formatAmount, formatBaseUnits, paidTowards, shortAddress, toBaseUnits } from "@/lib/format";

/** The reading pane: header, the letter, the money if there is any, the receipts. */
export function MailView({ message: m, box, verified }: { message: OpenedMessage; box: Box; verified: boolean | undefined }) {
  const { keys } = useVault();
  const markRead = useMarkRead(keys);
  const markReadMutate = markRead.mutate;

  useEffect(() => {
    if (box === "inbox" && !m.readAt) markReadMutate(m.id);
  }, [box, m.id, m.readAt, markReadMutate]);

  const p = m.payload;
  const isRecipient = keys?.address === m.envelope.to;

  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-[var(--line)] px-6 py-5 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {p && <KindChip kind={p.kind} />}
          <StateChip m={m} />
          {m.envelope.sealed ? <span className="chip">Sealed</span> : null}
          {verified === true && <span className="chip chip-mint">Signature verified</span>}
          {verified === false && <span className="chip chip-bad">Signature does not verify</span>}
          <span className="num ml-auto text-[12.5px] text-ink-3">{dateLabel(m.envelope.createdAt)}</span>
        </div>
        <h1 className="mt-4 text-[24px] leading-tight">{p ? p.subject || "(no subject)" : "Could not open this envelope"}</h1>
        <div className="mt-4 flex items-center gap-3">
          <Identicon address={m.peer} size={36} />
          <div className="min-w-0">
            <p className="text-[14px] text-ink-0">
              <span className="text-ink-3">{box === "inbox" ? "from " : "to "}</span>
              <Link href={`/to/${m.peer}`} className="addr hover:underline" title={checksum(m.peer)}>
                {shortAddress(m.peer, 10, 6)}
              </Link>
            </p>
            {p?.re && <p className="text-[12.5px] text-ink-3">In reply to an earlier envelope</p>}
          </div>
          <div className="ml-auto flex gap-2">
            <Link href={`/compose?to=${m.peer}&re=${m.id}&subject=${encodeURIComponent(p?.subject ? (p.subject.startsWith("Re:") ? p.subject : `Re: ${p.subject}`) : "")}`} className="btn btn-xs btn-glass">
              Reply
            </Link>
          </div>
        </div>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-6 py-6 md:px-8">
        {!p && (
          <p className="text-[14px] text-bad">
            {m.openError ?? "This envelope could not be opened with the keys on this device."}
            {m.envelope.sealed && " It was sealed to a different vault key — see the note in the rail."}
          </p>
        )}

        {p && p.kind !== "message" && p.amount && p.token && (
          <section className="glass glass-lit mb-6 rounded-[16px] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">{p.kind === "invoice" ? `Invoice${p.number ? ` ${p.number}` : ""}` : "Payment request"}</p>
                <p className="num mt-2 text-[30px] leading-none text-ink-0">{formatAmount(p.amount, p.token)}</p>
                {p.due && <p className="mt-2 text-[13px] text-ink-2">Due {dayLabel(p.due)}</p>}
                {p.token.kind === "erc20" && (
                  <p className="addr mt-1 text-ink-3" title={checksum(p.token.address)}>
                    {p.token.symbol} · {shortAddress(p.token.address)}
                  </p>
                )}
              </div>
              {isRecipient && <PayButton message={m} />}
            </div>
            {p.items && p.items.length > 0 && (
              <div className="mt-5 grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-2 border-t border-[var(--line)] pt-4 text-[13.5px]">
                {p.items.map((it, i) => (
                  <div key={i} className="contents">
                    <span className="text-ink-1">{it.label}</span>
                    <span className="num text-ink-3">× {it.qty}</span>
                    <span className="num text-right text-ink-0">{formatAmount(String(Number(it.unit) * it.qty), p.token!)}</span>
                  </div>
                ))}
              </div>
            )}
            <Receipts m={m} />
          </section>
        )}

        {p && <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-1">{p.body}</div>}
      </div>
    </article>
  );
}

function Receipts({ m }: { m: OpenedMessage }) {
  const p = m.payload;
  if (!m.receipts.length || !p?.token || !p.amount) return null;
  const paid = paidTowards(m.receipts, p.token);
  const total = toBaseUnits(p.amount, p.token.decimals);
  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <p className="text-[13px] font-medium text-ink-0">
        {paid >= total ? "Paid in full" : `Paid ${formatBaseUnits(paid, p.token.decimals, p.token.symbol)} of ${formatAmount(p.amount, p.token)}`}
        <span className="text-ink-3"> · verified on the chain</span>
      </p>
      <ul className="mt-2 space-y-1.5">
        {m.receipts.map((r) => {
          const symbol = r.token === "native" ? "ETH" : r.token === (p.token?.kind === "erc20" ? p.token.address.toLowerCase() : "") ? p.token!.symbol : "tokens";
          const decimals = r.token === "native" ? 18 : p.token?.kind === "erc20" && r.token === p.token.address.toLowerCase() ? p.token.decimals : 18;
          const url = explorerTx(r.txHash);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
              <span className="dot dot-live" />
              <span className="num text-ink-0">{formatBaseUnits(r.amount, decimals, symbol)}</span>
              <span className="text-ink-3">block {r.blockNumber.toLocaleString("en-US")}</span>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="addr text-ink-2 hover:text-ink-0">
                  {r.txHash.slice(0, 10)}…{r.txHash.slice(-6)} ↗
                </a>
              ) : (
                <span className="addr text-ink-2">{r.txHash.slice(0, 10)}…{r.txHash.slice(-6)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
