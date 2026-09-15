import { accessSync, constants, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Where the SQLite file lives, in order of preference:
 *
 *   1. `VAULTMAIL_DB_PATH` — a disk you chose.
 *   2. `./data/vaultmail.db` — a machine you own; persists across restarts.
 *   3. `<tmpdir>/vaultmail/vaultmail.db` — a read-only deployment (Vercel,
 *      Lambda: only /tmp is writable). The site runs, but this storage is
 *      *ephemeral*: a cold start is an empty registry and an empty inbox,
 *      and instances do not share it. Fine to show the product, not a place
 *      to keep anyone's mail. `/api/health` reports which case applies.
 */
export type DbPlacement = { path: string; ephemeral: boolean; reason: string | null };

function writable(dir: string): boolean {
  try {
    mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
    accessSync(/* turbopackIgnore: true */ dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function pickDbPath(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd(), tmp: string = tmpdir()): DbPlacement {
  const explicit = env.VAULTMAIL_DB_PATH?.trim();
  if (explicit) return { path: resolve(/* turbopackIgnore: true */ explicit), ephemeral: false, reason: null };
  const dataDir = join(cwd, "data");
  if (writable(dataDir)) return { path: join(dataDir, "vaultmail.db"), ephemeral: false, reason: null };
  const fallback = join(tmp, "vaultmail");
  mkdirSync(/* turbopackIgnore: true */ fallback, { recursive: true });
  return { path: join(fallback, "vaultmail.db"), ephemeral: true, reason: `${dataDir} is not writable (read-only deployment)` };
}
