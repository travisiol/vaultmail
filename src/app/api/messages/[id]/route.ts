import { isHex } from "@/lib/protocol/encoding";
import { handle, HttpError, json, requireVault } from "@/lib/server/http";
import { getMessage, markRead } from "@/lib/server/store";

export const runtime = "nodejs";

/** GET /api/messages/:id — one envelope, for its sender or recipient. Signed request. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isHex(id, 16)) throw new HttpError(400, "Message id malformed.");
    const address = requireVault(req, "");
    const message = getMessage(id);
    if (!message || (message.sender !== address && message.recipient !== address)) throw new HttpError(404, "No such message in this vault.");
    const { sender: _s, recipient: _r, ...stored } = message;
    void _s;
    void _r;
    return json({ message: stored });
  });
}

/** PATCH /api/messages/:id — the recipient marks it read. Signed request, idempotent. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isHex(id, 16)) throw new HttpError(400, "Message id malformed.");
    const raw = await req.text();
    const address = requireVault(req, raw);
    if (!markRead(id, address)) throw new HttpError(404, "No such message in this inbox.");
    return json({ id, read: true });
  });
}
