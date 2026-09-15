import { signRequest } from "@/lib/protocol/auth";
import type { VaultKeys } from "@/lib/protocol/keys";
import type { Address, Envelope, Receipt, Registration, StoredMessage } from "@/lib/protocol/types";

/**
 * The browser's view of the server. Every call that touches a vault is
 * signed with the vault's sign key (`signRequest`); public reads are not.
 * Errors carry the server's sentence, so the UI can show it as-is.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(keys: VaultKeys | null, method: string, path: string, body?: unknown): Promise<T> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (keys) Object.assign(headers, signRequest(keys, method, path, raw));
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : raw, cache: "no-store" });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  /** A wallet's published keys, or null when it has no vault. */
  async keysOf(address: Address): Promise<Registration | null> {
    try {
      const { registration } = await call<{ registration: Registration }>(null, "GET", `/api/keys/${address.toLowerCase()}`);
      return registration;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  publish(reg: Registration) {
    return call<{ registration: Registration; replaced: boolean }>(null, "POST", "/api/keys", reg);
  },
  list(keys: VaultKeys, box: "inbox" | "sent") {
    return call<{ box: string; messages: StoredMessage[] }>(keys, "GET", `/api/messages?box=${box}`);
  },
  send(keys: VaultKeys, envelope: Envelope) {
    return call<{ id: string; sealed: boolean; inserted: boolean }>(keys, "POST", "/api/messages", { envelope });
  },
  markRead(keys: VaultKeys, id: string) {
    return call<{ id: string; read: true }>(keys, "PATCH", `/api/messages/${id}`, {});
  },
  attachReceipt(keys: VaultKeys, id: string, txHash: string) {
    return call<{ receipt: Receipt; inserted: boolean }>(keys, "POST", `/api/messages/${id}/receipts`, { txHash });
  },
  stats() {
    return call<{ vaults: number; messages: number; sealed: number; paid: number }>(null, "GET", "/api/stats");
  },
};
