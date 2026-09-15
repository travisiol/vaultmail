"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { Identicon } from "@/components/Identicon";
import { KindChip } from "@/components/mail/KindChip";
import { navigate } from "@/lib/client/location";
import type { Box, OpenedMessage } from "@/lib/client/mail";
import { formatAmount, payState, shortAddress, timeAgo } from "@/lib/format";

export function StateChip({ m }: { m: OpenedMessage }) {
  const p = m.payload;
  if (!m.envelope.sealed) return <span className="chip">Unsealed</span>;
  if (!p || p.kind === "message") return null;
  const state = payState(m.receipts, p.amount, p.token);
  if (state === "paid") return <span className="chip chip-mint">Paid</span>;
  if (state === "partial") return <span className="chip chip-mint">Partly paid</span>;
  return <span className="chip">{p.kind === "invoice" ? "Due" : "Requested"}</span>;
}

export function MailList({ messages, box, selectedId, now, loading, error }: { messages: OpenedMessage[]; box: Box; selectedId: string | null; now: number; loading: boolean; error: string | null }) {
  if (error) return <p className="p-6 text-[14px] text-bad">{error}</p>;
  if (loading && !messages.length) return <p className="p-6 text-[14px] text-ink-3">Opening the vault…</p>;
  if (!messages.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <p className="text-[15px] font-medium text-ink-0">{box === "inbox" ? "Nothing here yet." : "Nothing sent yet."}</p>
        <p className="mt-2 max-w-[28ch] text-[13.5px] text-ink-3">
          {box === "inbox" ? "Share your vault link and anyone with your address can write to you." : "Write to a wallet — a message, an invoice or a request."}
        </p>
        <Link href={box === "inbox" ? "/compose" : "/compose"} className="btn btn-sm btn-glass mt-5">
          Compose
        </Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[var(--line)]">
      {messages.map((m) => {
        const unread = box === "inbox" && !m.readAt;
        const p = m.payload;
        return (
          <li key={m.id}>
            <a
              href={`/inbox?box=${box}&id=${m.id}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/inbox?box=${box}&id=${m.id}`);
              }}
              className={clsx("flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.04]", selectedId === m.id && "bg-white/[0.07]")}
            >
              <Identicon address={m.peer} size={34} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {unread && <span className="dot dot-live" />}
                  <span className={clsx("addr truncate", unread ? "text-ink-0" : "text-ink-2")}>
                    {box === "sent" && <span className="text-ink-3">to </span>}
                    {shortAddress(m.peer)}
                  </span>
                  <span className="num ml-auto shrink-0 text-[12px] text-ink-3">{timeAgo(m.receivedAt, now)}</span>
                </div>
                <p className={clsx("mt-0.5 truncate text-[14.5px]", unread ? "font-semibold text-ink-0" : "font-medium text-ink-1")}>
                  {p ? p.subject || "(no subject)" : m.openError ? "Could not open" : "…"}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {p && <KindChip kind={p.kind} />}
                  {p && p.kind !== "message" && p.amount && p.token && <span className="num text-[12.5px] text-ink-1">{formatAmount(p.amount, p.token)}</span>}
                  <StateChip m={m} />
                </div>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
