import { isAddress, lower } from "@/lib/protocol/encoding";
import { handle, HttpError, json } from "@/lib/server/http";
import { getVault } from "@/lib/server/store";

export const runtime = "nodejs";

/** GET /api/keys/0x… — a wallet's published vault keys, or 404 when it has none. Public. */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  return handle(async () => {
    const { address } = await ctx.params;
    if (!isAddress(address)) throw new HttpError(400, "Address malformed.");
    const reg = getVault(lower(address));
    if (!reg) throw new HttpError(404, "This wallet has not opened a vault.");
    return json({ registration: reg });
  });
}
