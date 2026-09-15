import Link from "next/link";
import { EnvelopeMark } from "@/components/EnvelopeMark";
import { chain } from "@/lib/chain";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="shell pb-10 pt-4">
      <div className="hairline flex flex-col gap-6 pt-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <EnvelopeMark size={26} id="footer-mark" />
          <span className="font-display text-[14px] font-semibold tracking-[0.12em] text-ink-0">
            {site.wordmark[0]} <span className="font-normal text-ink-2">{site.wordmark[1]}</span>
          </span>
          <span className="addr ml-2 text-ink-3">v{site.version} · {chain.name}</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-ink-2" aria-label="Footer">
          <Link href="/inbox" className="hover:text-ink-0">Inbox</Link>
          <Link href="/compose" className="hover:text-ink-0">Compose</Link>
          <Link href="/protocol" className="hover:text-ink-0">Protocol</Link>
          <Link href="/api/health" className="hover:text-ink-0">Health</Link>
        </nav>
      </div>
      <p className="mt-6 max-w-[72ch] text-[12.5px] leading-relaxed text-ink-3">
        VAULT MAIL carries envelopes and verifies receipts; it never holds funds and takes no fee. Payments are ordinary transfers on {chain.name}, sent from your wallet to theirs. Not affiliated with Robinhood.
      </p>
    </footer>
  );
}
