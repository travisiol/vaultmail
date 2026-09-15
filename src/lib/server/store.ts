import "server-only";
import { db } from "./db";
import type { Address, Envelope, Receipt, Registration, StoredMessage } from "../protocol/types";

/** The registry and the mailboxes, as plain functions over the one database. */

type VaultRow = { address: string; seal_pub: string; sign_pub: string; wallet_sig: string; registered_at: number };
type MessageRow = { id: string; sender: string; recipient: string; created_at: number; received_at: number; sealed: number; envelope: string; read_at: number | null };
type ReceiptRow = { id: string; message_id: string; chain_id: number; tx_hash: string; payer: string; payee: string; token: string; amount: string; block_number: number; verified_at: number };

function toRegistration(r: VaultRow): Registration {
  return { v: 1, address: r.address as Address, sealPub: r.seal_pub, signPub: r.sign_pub, walletSig: r.wallet_sig as `0x${string}`, registeredAt: r.registered_at };
}

function toReceipt(r: ReceiptRow): Receipt {
  return {
    id: r.id,
    messageId: r.message_id,
    chainId: r.chain_id,
    txHash: r.tx_hash as `0x${string}`,
    payer: r.payer as Address,
    payee: r.payee as Address,
    token: r.token,
    amount: r.amount,
    blockNumber: r.block_number,
    verifiedAt: r.verified_at,
  };
}

export function getVault(address: Address): Registration | null {
  const row = db().prepare("SELECT * FROM vaults WHERE address = ?").get(address) as VaultRow | undefined;
  return row ? toRegistration(row) : null;
}

export function signPubOf(address: Address): string | null {
  const row = db().prepare("SELECT sign_pub FROM vaults WHERE address = ?").get(address) as { sign_pub: string } | undefined;
  return row?.sign_pub ?? null;
}

export function putVault(reg: Registration, now = Date.now()): Registration {
  db()
    .prepare(
      `INSERT INTO vaults (address, seal_pub, sign_pub, wallet_sig, registered_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET seal_pub = excluded.seal_pub, sign_pub = excluded.sign_pub, wallet_sig = excluded.wallet_sig, registered_at = excluded.registered_at`,
    )
    .run(reg.address, reg.sealPub, reg.signPub, reg.walletSig, now);
  return { ...reg, registeredAt: now };
}

export function getMessage(id: string): (StoredMessage & { sender: Address; recipient: Address }) | null {
  const row = db().prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow | undefined;
  if (!row) return null;
  return { ...toStored(row, receiptsFor([row.id])), sender: row.sender as Address, recipient: row.recipient as Address };
}

export function putMessage(env: Envelope, now = Date.now()): { inserted: boolean } {
  const result = db()
    .prepare("INSERT OR IGNORE INTO messages (id, sender, recipient, created_at, received_at, sealed, envelope, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)")
    .run(env.id, env.from, env.to, env.createdAt, now, env.sealed ? 1 : 0, JSON.stringify(env));
  return { inserted: Number(result.changes) > 0 };
}

export function listMessages(address: Address, box: "inbox" | "sent", limit = 200): StoredMessage[] {
  const column = box === "inbox" ? "recipient" : "sender";
  const rows = db().prepare(`SELECT * FROM messages WHERE ${column} = ? ORDER BY received_at DESC LIMIT ?`).all(address, limit) as MessageRow[];
  const receipts = receiptsFor(rows.map((r) => r.id));
  return rows.map((r) => toStored(r, receipts));
}

export function markRead(id: string, recipient: Address, now = Date.now()): boolean {
  const result = db().prepare("UPDATE messages SET read_at = COALESCE(read_at, ?) WHERE id = ? AND recipient = ?").run(now, id, recipient);
  return Number(result.changes) > 0;
}

export function putReceipt(receipt: Receipt): { inserted: boolean } {
  const result = db()
    .prepare("INSERT OR IGNORE INTO receipts (id, message_id, chain_id, tx_hash, payer, payee, token, amount, block_number, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(receipt.id, receipt.messageId, receipt.chainId, receipt.txHash, receipt.payer, receipt.payee, receipt.token, receipt.amount, receipt.blockNumber, receipt.verifiedAt);
  return { inserted: Number(result.changes) > 0 };
}

export function receiptByTx(chainId: number, txHash: string): Receipt | null {
  const row = db().prepare("SELECT * FROM receipts WHERE chain_id = ? AND tx_hash = ?").get(chainId, txHash) as ReceiptRow | undefined;
  return row ? toReceipt(row) : null;
}

export function stats(): { vaults: number; messages: number; sealed: number; paid: number } {
  const d = db();
  const vaults = (d.prepare("SELECT COUNT(*) AS n FROM vaults").get() as { n: number }).n;
  const messages = (d.prepare("SELECT COUNT(*) AS n FROM messages").get() as { n: number }).n;
  const sealed = (d.prepare("SELECT COUNT(*) AS n FROM messages WHERE sealed = 1").get() as { n: number }).n;
  const paid = (d.prepare("SELECT COUNT(DISTINCT message_id) AS n FROM receipts").get() as { n: number }).n;
  return { vaults, messages, sealed, paid };
}

function receiptsFor(ids: string[]): Map<string, Receipt[]> {
  const map = new Map<string, Receipt[]>();
  if (!ids.length) return map;
  const placeholders = ids.map(() => "?").join(",");
  const rows = db().prepare(`SELECT * FROM receipts WHERE message_id IN (${placeholders}) ORDER BY verified_at ASC`).all(...ids) as ReceiptRow[];
  for (const r of rows) {
    const list = map.get(r.message_id) ?? [];
    list.push(toReceipt(r));
    map.set(r.message_id, list);
  }
  return map;
}

function toStored(row: MessageRow, receipts: Map<string, Receipt[]>): StoredMessage {
  return { envelope: JSON.parse(row.envelope) as Envelope, receivedAt: row.received_at, readAt: row.read_at, receipts: receipts.get(row.id) ?? [] };
}
