import { Identicon } from "@/components/Identicon";
import { KindChip } from "@/components/mail/KindChip";

/**
 * A still of the inbox for the landing page. Sample envelopes, labelled as
 * such — the real inbox is one click away and starts empty.
 */
const ROWS = [
  { from: "0x8f1c2a9e4b7d6f3a1c5e9b2d4f6a8c0e2b4d6f8a", subject: "Invoice INV-0042 — March retainer", kind: "invoice" as const, time: "2h", state: "paid" as const, active: true },
  { from: "0x3b9d7e5c1a4f8b2d6e0c9a7f5b3d1e8c6a4f2b0d", subject: "Can you send 0.12 ETH for the venue deposit?", kind: "request" as const, time: "5h", state: "unpaid" as const },
  { from: "0xc47a2e9f6b1d8c3a5e7f9b2d4c6a8e0f1b3d5c7a", subject: "Re: the keys for Friday", kind: "message" as const, time: "1d" },
  { from: "0x5e2f8a1c9d4b7e6a3f0c2b8d5a9e1f4c7b3d6a0e", subject: "Split for the Lisbon trip", kind: "request" as const, time: "3d", state: "paid" as const },
];

export function InboxPreview() {
  return (
    <div className="glass glass-tile overflow-hidden">
      <div className="hairline flex items-center gap-3 border-t-0 border-b border-[var(--line)] px-5 py-3">
        <span className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <i className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <i className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="addr text-ink-3">vaultmail / inbox / 0x71c9…9a2f</span>
        <span className="chip ml-auto">Preview · sample envelopes</span>
      </div>
      <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ul className="divide-y divide-[var(--line)] md:border-r md:border-[var(--line)]">
          {ROWS.map((r) => (
            <li key={r.from} className={r.active ? "bg-white/[0.06]" : ""}>
              <div className="flex items-center gap-3 px-5 py-4">
                <Identicon address={r.from} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="addr truncate text-ink-2">{r.from.slice(0, 6)}…{r.from.slice(-4)}</span>
                    <span className="num ml-auto text-[12px] text-ink-3">{r.time}</span>
                  </div>
                  <p className="truncate text-[14.5px] font-medium text-ink-0">{r.subject}</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <KindChip kind={r.kind} />
                    {r.state === "paid" && <span className="chip chip-mint">Paid</span>}
                    {r.state === "unpaid" && <span className="chip">Due</span>}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-3">
            <Identicon address={ROWS[0].from} size={40} />
            <div>
              <p className="text-[15px] font-medium text-ink-0">Invoice INV-0042 — March retainer</p>
              <p className="addr text-ink-2">from 0x8f1c…6f8a · sealed · signature verified</p>
            </div>
          </div>
          <div className="glass glass-quiet mt-6 rounded-[16px] p-5">
            <div className="grid grid-cols-[1fr_auto] gap-y-2 text-[14px]">
              <span className="text-ink-1">Design retainer · March</span>
              <span className="num text-ink-0">0.40 ETH</span>
              <span className="text-ink-1">Revisions · 2 rounds</span>
              <span className="num text-ink-0">0.10 ETH</span>
              <span className="hairline pt-3 font-medium text-ink-0">Total</span>
              <span className="num hairline pt-3 text-[17px] text-ink-0">0.50 ETH</span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="chip chip-mint">
              <span className="dot dot-live" /> Paid in full · 0.50 ETH
            </span>
            <span className="addr text-ink-3">tx 0x9b3e…41cd · block 1,204,118</span>
          </div>
          <p className="mt-6 text-[14.5px] leading-relaxed text-ink-1">
            Thanks again for March. April&apos;s scope is in the thread below — same terms unless you want to change something.
          </p>
        </div>
      </div>
    </div>
  );
}
