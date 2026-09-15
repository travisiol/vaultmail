"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EnvelopeMark } from "@/components/EnvelopeMark";
import { useVault } from "@/components/vault/VaultProvider";
import { shortAddress } from "@/lib/format";
import { site } from "@/lib/site";

const LINKS = [
  { href: "/#kinds", label: "What you can send" },
  { href: "/#how", label: "How it works" },
  { href: "/protocol", label: "Protocol" },
];

/** One glass pill across the top, on every page that scrolls. */
export function Nav() {
  const { address, keys } = useVault();
  const pathname = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4 sm:pt-5">
      <nav className="glass glass-quiet flex h-14 w-full max-w-[1120px] items-center gap-2 rounded-full pl-2 pr-2" aria-label="Main">
        <Link href="/" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-opacity hover:opacity-90">
          <EnvelopeMark size={30} id="nav-mark" />
          <span className="font-display text-[15px] font-semibold tracking-[0.12em] text-ink-0">
            {site.wordmark[0]}
            <span className="font-normal text-ink-2"> {site.wordmark[1]}</span>
          </span>
        </Link>
        <div className="mx-auto hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "rounded-full px-3.5 py-2 text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink-0",
                pathname === l.href && "text-ink-0",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <Link href="/inbox" className={clsx("btn btn-sm ml-auto md:ml-0", keys ? "btn-glass" : "btn-mint")}>
          {keys ? (
            <>
              <span className="dot dot-live" />
              <span className="addr text-[12.5px]">{shortAddress(keys.address)}</span>
            </>
          ) : address ? (
            <>
              <span className="dot" />
              Unlock inbox
            </>
          ) : (
            "Open your inbox"
          )}
        </Link>
      </nav>
    </header>
  );
}
