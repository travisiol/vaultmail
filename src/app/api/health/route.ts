import { chain } from "@/lib/chain";
import { serverChainId } from "@/lib/server/payments";
import { handle, json } from "@/lib/server/http";
import { storageInfo } from "@/lib/server/db";
import { site } from "@/lib/site";

export const runtime = "nodejs";

/** GET /api/health — which chain, where the database is, whether it survives a restart. */
export async function GET() {
  return handle(async () => {
    const storage = storageInfo();
    return json({ ok: true, name: site.name, version: site.version, chainId: serverChainId(), chain: serverChainId() === chain.id ? chain.name : `chain ${serverChainId()}`, storage: { ephemeral: storage.ephemeral, reason: storage.reason } });
  });
}
