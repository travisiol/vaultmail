"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UnlockPanel } from "@/components/app/UnlockPanel";
import { Nav } from "@/components/site/Nav";
import { useVault } from "@/components/vault/VaultProvider";
import { chain } from "@/lib/chain";
import { navigate, useLocationSearch } from "@/lib/client/location";
import { shortAddress } from "@/lib/format";

/**
 * The application frame: the site nav, then one tall glass window. Locked,
 * the window shows the door; unlocked, it shows the mail client with a
 * slim rail on the left (Inbox, Sent, Compose, the vault's status).
 */
export function AppShell({ children, gate = true }: { children: ReactNode; gate?: boolean }) {
  const { keys } = useVault();
  return (
    <>
      <Nav />
      <main className="shell pb-8 pt-[calc(var(--nav-h)+20px)]">
        <div className="glass glass-tile glass-quiet flex min-h-[calc(100svh-var(--nav-h)-52px)] overflow-hidden">
          {gate && !keys ? (
            <div className="flex flex-1 items-center justify-center">
              <UnlockPanel />
            </div>
          ) : (
            <>
              <Rail />
              <div className="flex min-w-0 flex-1 flex-col">{children}</div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function Rail() {
  const { keys, address, wrongChain, switchChain, lock, mismatch, republish, step } = useVault();
  const pathname = usePathname();
  const sp = useLocationSearch();
  const box = sp.get("box") === "sent" ? "sent" : "inbox";
  const items = [
    { href: "/inbox", label: "Inbox", active: pathname === "/inbox" && box === "inbox" },
    { href: "/inbox?box=sent", label: "Sent", active: pathname === "/inbox" && box === "sent" },
  ];
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[var(--line)] p-4 md:flex">
      <Link href="/compose" className={clsx("btn btn-mint w-full", pathname === "/compose" && "opacity-90")}>
        Compose
      </Link>
      <nav className="mt-4 space-y-1" aria-label="Mailboxes">
        {items.map((it) => (
          <a
            key={it.href}
            href={it.href}
            onClick={(e) => {
              if (pathname === "/inbox") {
                e.preventDefault();
                navigate(it.href);
              }
            }}
            className={clsx("flex h-10 items-center rounded-[12px] px-3 text-[14px] font-medium transition-colors", it.active ? "bg-white/[0.08] text-ink-0" : "text-ink-2 hover:bg-white/[0.04] hover:text-ink-0")}
          >
            {it.label}
          </a>
        ))}
      </nav>
      <div className="mt-auto space-y-3">
        {wrongChain && (
          <button type="button" className="btn btn-sm btn-glass w-full" onClick={() => void switchChain()}>
            Switch to {chain.name}
          </button>
        )}
        {mismatch && (
          <div className="rounded-[12px] border border-bad/40 bg-bad/10 p-3 text-[12.5px] leading-snug text-ink-1">
            Today&apos;s signature gave different keys than the ones published. Older mail will not open on this device.
            <button type="button" className="btn btn-xs btn-glass mt-2 w-full" disabled={step !== "idle"} onClick={() => void republish()}>
              Republish today&apos;s keys
            </button>
          </div>
        )}
        {keys && (
          <div className="glass glass-quiet rounded-[14px] p-3">
            <div className="flex items-center gap-2">
              <span className="dot dot-live" />
              <span className="addr text-ink-0">{shortAddress(keys.address)}</span>
            </div>
            <p className="mt-1 text-[12px] text-ink-3">Vault unlocked · {chain.name}</p>
            <div className="mt-3 flex gap-2">
              <Link href={`/to/${address}`} className="btn btn-xs btn-glass flex-1">
                My vault link
              </Link>
              <button type="button" className="btn btn-xs btn-ghost" onClick={lock} title="Forget the keys in this tab">
                Lock
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
