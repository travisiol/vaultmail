import { handle, json } from "@/lib/server/http";
import { stats } from "@/lib/server/store";

export const runtime = "nodejs";

/** GET /api/stats — how many vaults, envelopes and paid envelopes. Public, real, never seeded. */
export async function GET() {
  return handle(async () => json(stats()));
}
