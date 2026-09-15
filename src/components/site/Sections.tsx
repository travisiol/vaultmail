import Link from "next/link";
import { ChainGlyph, InvoiceGlyph, KeyGlyph, MessageGlyph, RequestGlyph, SealGlyph } from "@/components/site/Glyphs";
import { InboxPreview } from "@/components/site/InboxPreview";

/* ---------------------------------------------------------------------------
   The landing below the fold. Each section is one idea, one glass object.
   ------------------------------------------------------------------------ */

export function KindsSection() {
  const kinds = [
    {
      glyph: <MessageGlyph />,
      title: "A message",
      body: "Plain words to a wallet, from a wallet. Sealed to the recipient's vault key; signed so the sender cannot be forged.",
      foot: "Subject · body · reply threading",
    },
    {
      glyph: <InvoiceGlyph />,
      title: "An invoice",
      body: "Line items, a number, a due date, an amount in ETH or any ERC-20. The recipient pays from the envelope and the receipt attaches itself.",
      foot: "Items · due date · pay in one tap",
    },
    {
      glyph: <RequestGlyph />,
      title: "A payment request",
      body: "An amount and a reason. When it is paid, the transaction that paid it is verified on the chain and shown to both sides.",
      foot: "Amount · memo · onchain receipt",
    },
  ];
  return (
    <section id="kinds" className="section scroll-mt-24">
      <div className="shell">
        <div className="reveal max-w-[640px]">
          <p className="eyebrow mb-4">What you can send</p>
          <h2 className="display display-lg">Three things a wallet can put in another wallet&apos;s inbox.</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {kinds.map((k, i) => (
            <article key={k.title} className="glass glass-tile reveal flex flex-col p-7" style={{ transitionDelay: `${i * 90}ms` }}>
              {k.glyph}
              <h3 className="mt-6 text-[22px]">{k.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-1">{k.body}</p>
              <p className="eyebrow mt-auto pt-7 normal-case tracking-normal text-ink-3">{k.foot}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowSection() {
  const steps = [
    { n: "01", title: "Connect", body: "Any browser wallet. No account, no email, no password — the address is the identity." },
    { n: "02", title: "Sign once", body: "One signature derives your vault keys on the device and publishes the public halves. It is not a transaction and costs nothing." },
    { n: "03", title: "Seal and send", body: "Write to any address. The envelope is encrypted to the recipient's key and to yours, then signed and delivered." },
    { n: "04", title: "Pay in one tap", body: "An invoice carries a Pay button. The transfer settles onchain; the receipt is verified and pinned to the envelope for both sides." },
  ];
  return (
    <section id="how" className="section scroll-mt-24 pt-0">
      <div className="shell">
        <div className="glass glass-tile reveal overflow-hidden">
          <div className="grid gap-px md:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.n} className="relative p-7 md:p-8" style={{ borderLeft: i ? "1px solid var(--line)" : undefined }}>
                <p className="num text-[13px] text-mint-2">{s.n}</p>
                <h3 className="mt-5 text-[22px]">{s.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-1">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="hairline flex flex-wrap items-center justify-between gap-4 px-7 py-5 md:px-8">
            <p className="text-[14px] text-ink-2">Two signatures the first time, one after that. Gas only when you pay someone.</p>
            <Link href="/inbox" className="btn btn-sm btn-mint">
              Open your inbox
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PreviewSection() {
  return (
    <section className="section pt-0">
      <div className="shell">
        <div className="reveal max-w-[640px]">
          <p className="eyebrow mb-4">The inbox</p>
          <h2 className="display display-lg">Mail that knows what it is worth.</h2>
          <p className="lede mt-5">
            Requests show what is owed, invoices show what was paid and the transaction that paid it. Everything else is a message — and stays yours to read.
          </p>
        </div>
        <div className="reveal mt-12">
          <InboxPreview />
        </div>
      </div>
    </section>
  );
}

export function SealedSection() {
  const sealed = ["Subject and body", "Amount, token and due date", "Line items and invoice number", "Which envelope a reply answers"];
  const clear = ["Sender and recipient addresses", "When it was sent", "Whether it is sealed or not", "Payment receipts — public on the chain anyway"];
  return (
    <section id="sealed" className="section pt-0">
      <div className="shell grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-start">
        <div className="reveal">
          <p className="eyebrow mb-4">Sealed, signed, settled</p>
          <h2 className="display display-lg">The server carries the envelope. It cannot open it.</h2>
          <p className="lede mt-5">
            Your vault keys come from your wallet&apos;s signature and never leave your device. An envelope is encrypted to the recipient&apos;s key and to yours, bound to its
            header so it cannot be re-addressed, and signed so it cannot be forged.
          </p>
          <Link href="/protocol" className="btn btn-glass mt-8">
            Read the protocol
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="glass glass-lit reveal p-6">
            <SealGlyph />
            <h3 className="mt-5 text-[18px]">Sealed — only the two wallets</h3>
            <ul className="mt-4 space-y-2 text-[14.5px] text-ink-1">
              {sealed.map((s) => (
                <li key={s} className="flex gap-3">
                  <span className="dot dot-live mt-2" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass reveal p-6" style={{ transitionDelay: "90ms" }}>
            <ChainGlyph />
            <h3 className="mt-5 text-[18px]">In the clear — what the server sees</h3>
            <ul className="mt-4 space-y-2 text-[14.5px] text-ink-1">
              {clear.map((s) => (
                <li key={s} className="flex gap-3">
                  <span className="dot mt-2" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass reveal p-6 sm:col-span-2" style={{ transitionDelay: "160ms" }}>
            <div className="flex items-start gap-4">
              <KeyGlyph />
              <div>
                <h3 className="text-[18px]">If the recipient has no vault yet</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-1">
                  There is no key to seal to. You can still send, and the envelope is stored <em>unsealed</em> and labelled as such for both of you — or you share their
                  vault link and wait. Nothing is ever downgraded quietly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is this onchain?",
    a: "The payments are — an invoice is paid with a normal transfer on Robinhood Chain, and the receipt you see is that transaction, read back from the chain. The envelopes themselves are not; they are signed and encrypted on your device and carried by a mail server that cannot read them.",
  },
  {
    q: "What does it cost?",
    a: "Nothing to write, read, or open a vault: those are signatures, not transactions. Paying an invoice costs the gas of the transfer, and the transfer goes straight from your wallet to theirs — VAULT MAIL takes no fee and never holds funds.",
  },
  {
    q: "Why do I sign twice the first time?",
    a: "The first signature is the key: your vault keys are derived from it, on the device, and never stored. The second publishes the public halves under your address so other wallets can seal mail to you and check it really is you. After that it is one signature per session.",
  },
  {
    q: "Can I read old mail on a new device?",
    a: "Yes. Wallets sign deterministically, so the same wallet signing the same text produces the same keys anywhere. A few hardware and smart-contract wallets do not; the inbox detects the mismatch and tells you, rather than silently registering a new key.",
  },
  {
    q: "What if I write to a wallet that has never opened a vault?",
    a: "There is no key to seal to, so the envelope is sent unsealed and marked unsealed on both sides. You are told before you send. When they open a vault, it is waiting for them.",
  },
  {
    q: "Where does the mail live?",
    a: "On the server running this site, in a database that keeps only what the sealed section above lists as “in the clear”. A hosted preview may run on ephemeral storage; the health endpoint says so, and the README says how to give it a disk.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="section pt-0">
      <div className="shell grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="reveal">
          <p className="eyebrow mb-4">Questions</p>
          <h2 className="display display-lg">Straight answers.</h2>
        </div>
        <div className="glass glass-tile reveal divide-y divide-[var(--line)] px-2">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-medium text-ink-0 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--rim)] text-ink-2 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-1">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ClosingSection() {
  return (
    <section className="section pt-0">
      <div className="shell">
        <div className="glass glass-tile glass-lit reveal relative overflow-hidden px-8 py-16 text-center md:py-24">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(95,227,161,0.22),transparent)]" />
          <h2 className="display display-lg relative">Your wallet has an inbox.</h2>
          <p className="lede relative mx-auto mt-5 max-w-[520px]">Open it once. From then on, anyone with your address can write to you, bill you, or ask you — and you can pay them from the letter.</p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/inbox" className="btn btn-mint">
              Open your inbox
            </Link>
            <Link href="/protocol" className="btn btn-glass">
              Protocol
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
