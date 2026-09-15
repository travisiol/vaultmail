"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/client/api";
import { open, verifyEnvelope } from "@/lib/protocol/envelope";
import type { VaultKeys } from "@/lib/protocol/keys";
import type { Address, Payload, Registration, StoredMessage } from "@/lib/protocol/types";

/**
 * The inbox as the browser sees it: envelopes fetched with a signed request,
 * opened with the vault keys, and the sender's signature checked against
 * the sender's published key. Opening is memoised per envelope id — the
 * keys never change within a session, so neither does the plaintext.
 */

export type Box = "inbox" | "sent";

export type OpenedMessage = StoredMessage & {
  id: string;
  /** The other party: sender in the inbox, recipient in sent. */
  peer: Address;
  payload: Payload | null;
  /** Why it could not be opened, if it could not. */
  openError: string | null;
};

const opened = new Map<string, { payload: Payload | null; error: string | null }>();

export function openStored(stored: StoredMessage, keys: VaultKeys): OpenedMessage {
  const env = stored.envelope;
  const cacheKey = `${keys.address}:${env.id}`;
  let hit = opened.get(cacheKey);
  if (!hit) {
    try {
      hit = { payload: open(env, keys), error: null };
    } catch (err) {
      hit = { payload: null, error: (err as Error).message };
    }
    opened.set(cacheKey, hit);
  }
  return {
    ...stored,
    id: env.id,
    peer: env.from === keys.address ? env.to : env.from,
    payload: hit.payload,
    openError: hit.error,
  };
}

export function mailboxKey(address: Address, box: Box) {
  return ["mailbox", address, box] as const;
}

export function useMailbox(keys: VaultKeys | null, box: Box) {
  const query = useQuery({
    queryKey: mailboxKey(keys?.address ?? "0x", box),
    queryFn: async () => (await api.list(keys!, box)).messages,
    enabled: Boolean(keys),
    refetchInterval: 15_000,
  });
  const messages = useMemo(() => (keys && query.data ? query.data.map((m) => openStored(m, keys)) : []), [keys, query.data]);
  return { ...query, messages };
}

/** Published keys of a wallet, cached for the session. `null` = no vault. */
export function useVaultOf(address: Address | null | undefined) {
  return useQuery({
    queryKey: ["vault-of", address ?? ""],
    queryFn: () => api.keysOf(address!),
    enabled: Boolean(address),
    staleTime: 60_000,
  });
}

const verdicts = new Map<string, boolean>();

/** Signature checks for a batch of messages: id → true / false / undefined (sender's key still loading). Verdicts are cached per (id, key). */
export function useSignatureChecks(messages: OpenedMessage[]): Record<string, boolean | undefined> {
  const senders = useMemo(() => Array.from(new Set(messages.map((m) => m.envelope.from))), [messages]);
  const results = useQueries({
    queries: senders.map((address) => ({ queryKey: ["vault-of", address], queryFn: () => api.keysOf(address), staleTime: 60_000 })),
  });
  const byAddress = new Map<string, Registration | null | undefined>();
  senders.forEach((a, i) => byAddress.set(a, results[i].data));
  const out: Record<string, boolean | undefined> = {};
  for (const m of messages) {
    const reg = byAddress.get(m.envelope.from);
    if (reg === undefined) continue;
    if (reg === null) {
      out[m.id] = false;
      continue;
    }
    const key = `${m.id}:${reg.signPub}`;
    let v = verdicts.get(key);
    if (v === undefined) {
      v = verifyEnvelope(m.envelope, reg.signPub);
      verdicts.set(key, v);
    }
    out[m.id] = v;
  }
  return out;
}

export function useMarkRead(keys: VaultKeys | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markRead(keys!, id),
    onSuccess: (_d, id) => {
      if (!keys) return;
      qc.setQueryData<StoredMessage[]>(mailboxKey(keys.address, "inbox"), (old) => old?.map((m) => (m.envelope.id === id && !m.readAt ? { ...m, readAt: Date.now() } : m)));
    },
  });
}

export function useInvalidateMail(keys: VaultKeys | null) {
  const qc = useQueryClient();
  return () => {
    if (!keys) return;
    void qc.invalidateQueries({ queryKey: ["mailbox", keys.address] });
    void qc.invalidateQueries({ queryKey: ["stats"] });
  };
}
