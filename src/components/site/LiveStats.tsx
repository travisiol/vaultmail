"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api } from "@/lib/client/api";

/** Real counts from the registry — never seeded, so a fresh deployment says "nobody yet" and means it. */
export function LiveStats({ className }: { className?: string }) {
  const { data } = useQuery({ queryKey: ["stats"], queryFn: api.stats, staleTime: 30_000 });
  if (!data) return <p className={clsx("num text-[13px] text-ink-3", className)}>&nbsp;</p>;
  if (data.vaults === 0) {
    return <p className={clsx("num text-[13px] text-ink-3", className)}>No vault open yet on this deployment — yours would be the first.</p>;
  }
  return (
    <p className={clsx("num flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2", className)}>
      <span>
        <b className="font-medium text-ink-0">{data.vaults}</b> {data.vaults === 1 ? "vault" : "vaults"} open
      </span>
      <span>
        <b className="font-medium text-ink-0">{data.messages}</b> {data.messages === 1 ? "envelope" : "envelopes"}
        {data.messages > 0 && <span className="text-ink-3"> · {Math.round((data.sealed / data.messages) * 100)}% sealed</span>}
      </span>
      <span>
        <b className="font-medium text-ink-0">{data.paid}</b> paid onchain
      </span>
    </p>
  );
}
