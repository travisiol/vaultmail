import { formatUnits, getAddress, parseUnits } from "viem";
import type { Address, Receipt, TokenRef } from "@/lib/protocol/types";

export function shortAddress(address: string, head = 6, tail = 4): string {
  const a = checksum(address);
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export function checksum(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

export function isSameAddress(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** "0.25 ETH" from a decimal string the sender typed. */
export function formatAmount(amount: string, token: TokenRef): string {
  const n = Number(amount);
  const shown = Number.isFinite(n) ? trimZeros(n.toLocaleString("en-US", { maximumFractionDigits: 6, minimumFractionDigits: 0 })) : amount;
  return `${shown} ${token.symbol}`;
}

/** Base units → decimal string for display. */
export function formatBaseUnits(amount: string | bigint, decimals: number, symbol?: string): string {
  const s = formatUnits(BigInt(amount), decimals);
  const n = Number(s);
  const shown = Number.isFinite(n) && Math.abs(n) < 1e15 ? trimZeros(n.toLocaleString("en-US", { maximumFractionDigits: 6 })) : s;
  return symbol ? `${shown} ${symbol}` : shown;
}

export function toBaseUnits(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function tokenKey(token: TokenRef): string {
  return token.kind === "native" ? "native" : token.address.toLowerCase();
}

/** Sum what the receipts paid in the requested token, as base units. */
export function paidTowards(receipts: Receipt[], token: TokenRef): bigint {
  const key = tokenKey(token);
  return receipts.filter((r) => r.token === key).reduce((sum, r) => sum + BigInt(r.amount), 0n);
}

export type PayState = "unpaid" | "partial" | "paid";

export function payState(receipts: Receipt[], amount: string | undefined, token: TokenRef | undefined): PayState {
  if (!amount || !token) return "unpaid";
  const paid = paidTowards(receipts, token);
  if (paid === 0n) return "unpaid";
  return paid >= toBaseUnits(amount, token.decimals) ? "paid" : "partial";
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dateLabel(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function asAddress(value: string): Address | null {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim()) ? (value.trim().toLowerCase() as Address) : null;
}
