"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { EnvelopeMark } from "@/components/EnvelopeMark";
import { MailList } from "@/components/mail/MailList";
import { MailView } from "@/components/mail/MailView";
import { useVault } from "@/components/vault/VaultProvider";
import { navigate, useLocationSearch } from "@/lib/client/location";
import { useMailbox, useSignatureChecks } from "@/lib/client/mail";

/** Two panes: the list and the letter. On a phone, one at a time. */
export function InboxClient() {
  const { keys } = useVault();
  const sp = useLocationSearch();
  const box = sp.get("box") === "sent" ? "sent" : "inbox";
  const selectedId = sp.get("id");
  const { messages, isLoading, error, refetch, isFetching } = useMailbox(keys, box);
  const verified = useSignatureChecks(messages);
  const [now] = useState(() => Date.now());
  const selected = messages.find((m) => m.id === selectedId) ?? null;
  const unread = box === "inbox" ? messages.filter((m) => !m.readAt).length : 0;

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1">
        <section className={clsx("flex w-full flex-col border-[var(--line)] md:w-[380px] md:shrink-0 md:border-r", selected && "hidden md:flex")} aria-label={box === "inbox" ? "Inbox" : "Sent"}>
          <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3.5">
            <h1 className="text-[17px]">{box === "inbox" ? "Inbox" : "Sent"}</h1>
            {unread > 0 && <span className="chip chip-mint">{unread} new</span>}
            <div className="ml-auto flex items-center gap-2 md:hidden">
              <button type="button" className={clsx("btn btn-xs", box === "inbox" ? "btn-glass" : "btn-ghost")} onClick={() => navigate("/inbox")}>
                Inbox
              </button>
              <button type="button" className={clsx("btn btn-xs", box === "sent" ? "btn-glass" : "btn-ghost")} onClick={() => navigate("/inbox?box=sent")}>
                Sent
              </button>
              <Link href="/compose" className="btn btn-xs btn-mint">
                Compose
              </Link>
            </div>
            <button type="button" className="btn btn-xs btn-ghost ml-auto hidden md:inline-flex" onClick={() => void refetch()} disabled={isFetching} title="Refresh">
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </header>
          <div className="scroll-thin flex flex-1 flex-col overflow-y-auto">
            <MailList messages={messages} box={box} selectedId={selectedId} now={now} loading={isLoading} error={error ? (error as Error).message : null} />
          </div>
        </section>

        <section className={clsx("flex min-w-0 flex-1 flex-col", !selected && "hidden md:flex")} aria-label="Message">
          {selected ? (
            <>
              <div className="border-b border-[var(--line)] px-4 py-2 md:hidden">
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => navigate(`/inbox${box === "sent" ? "?box=sent" : ""}`)}>
                  ← {box === "inbox" ? "Inbox" : "Sent"}
                </button>
              </div>
              <MailView key={selected.id} message={selected} box={box} verified={verified[selected.id]} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <EnvelopeMark size={72} id="empty-mark" className="opacity-80" />
              <p className="mt-5 text-[15px] text-ink-2">{messages.length ? "Pick an envelope." : "Your vault is open."}</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
