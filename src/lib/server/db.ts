import "server-only";
import { DatabaseSync } from "node:sqlite";
import { pickDbPath, type DbPlacement } from "./dbPath";

/**
 * One SQLite file, opened once per process (`node:sqlite`, Node 22.13+ / 24:
 * nothing to build). The schema is created on first open.
 *
 * What the server keeps, and therefore what an operator can see:
 *   vaults    — who published which public keys, and the wallet signature
 *   messages  — who wrote to whom, when, and an opaque sealed envelope
 *               (or a plaintext one, flagged, when the recipient had no vault)
 *   receipts  — payments verified onchain, which are public anyway
 *
 * Amounts are base units as TEXT (SQLite integers stop at 2^63).
 */

declare global {
  // Survives Next's dev-time module reloads, which would otherwise open a
  // fresh handle per reload.
  var __vaultmailDb: DatabaseSync | undefined;
  var __vaultmailDbPlacement: DbPlacement | undefined;
}

export function storageInfo(): DbPlacement {
  if (!globalThis.__vaultmailDbPlacement) {
    const placement = pickDbPath();
    if (placement.ephemeral) {
      console.warn(
        `[vaultmail] ${placement.reason} — using ${placement.path}. This storage is ephemeral: the registry and every inbox reset on a cold start and are not shared between instances. Set VAULTMAIL_DB_PATH to a persistent disk before anyone relies on it.`,
      );
    }
    globalThis.__vaultmailDbPlacement = placement;
  }
  return globalThis.__vaultmailDbPlacement;
}

function open(): DatabaseSync {
  const db = new DatabaseSync(storageInfo().path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS vaults (
      address       TEXT PRIMARY KEY,
      seal_pub      TEXT NOT NULL,
      sign_pub      TEXT NOT NULL,
      wallet_sig    TEXT NOT NULL,
      registered_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id           TEXT PRIMARY KEY,
      sender       TEXT NOT NULL,
      recipient    TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      received_at  INTEGER NOT NULL,
      sealed       INTEGER NOT NULL,
      envelope     TEXT NOT NULL,
      read_at      INTEGER
    );
    CREATE INDEX IF NOT EXISTS messages_recipient ON messages (recipient, received_at DESC);
    CREATE INDEX IF NOT EXISTS messages_sender ON messages (sender, received_at DESC);
    CREATE TABLE IF NOT EXISTS receipts (
      id           TEXT PRIMARY KEY,
      message_id   TEXT NOT NULL REFERENCES messages (id),
      chain_id     INTEGER NOT NULL,
      tx_hash      TEXT NOT NULL,
      payer        TEXT NOT NULL,
      payee        TEXT NOT NULL,
      token        TEXT NOT NULL,
      amount       TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      verified_at  INTEGER NOT NULL,
      UNIQUE (chain_id, tx_hash)
    );
    CREATE INDEX IF NOT EXISTS receipts_message ON receipts (message_id);
  `);
  return db;
}

export function db(): DatabaseSync {
  if (!globalThis.__vaultmailDb) globalThis.__vaultmailDb = open();
  return globalThis.__vaultmailDb;
}
