import { assertEnvelopeShape, verifyEnvelope } from "@/lib/protocol/envelope";
import { LIMITS, type Envelope } from "@/lib/protocol/types";
import { handle, HttpError, json, readJson, requireVault } from "@/lib/server/http";
import { getVault, listMessages, putMessage } from "@/lib/server/store";

export const runtime = "nodejs";

/** GET /api/messages?box=inbox|sent — the caller's envelopes, newest first. Signed request. */
export async function GET(req: Request) {
  return handle(async () => {
    const address = requireVault(req, "");
    const box = new URL(req.url).searchParams.get("box") === "sent" ? "sent" : "inbox";
    return json({ box, messages: listMessages(address, box) });
  });
}

/**
 * POST /api/messages — deliver an envelope. Signed request; the envelope's
 * `from` must be the signer, and its own signature must verify against the
 * sender's published sign key. A sealed envelope must be sealed for its
 * recipient, who must have a vault; an unsealed one is only accepted when
 * the recipient has none (so nobody can quietly downgrade a sealed
 * conversation to plaintext).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const raw = await req.text();
    if (raw.length > LIMITS.payloadBytes * 3) throw new HttpError(413, "Envelope too large.");
    const address = requireVault(req, raw);
    const body = await readJson<{ envelope?: unknown }>(req, raw);
    try {
      assertEnvelopeShape(body.envelope);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    const env = body.envelope as Envelope;
    if (env.from !== address) throw new HttpError(403, "The envelope's sender must be the wallet signing the request.");
    const sender = getVault(env.from);
    if (!sender || !verifyEnvelope(env, sender.signPub)) throw new HttpError(401, "The envelope's signature does not verify against the sender's vault.");

    const recipient = getVault(env.to);
    if (env.sealed && !recipient) throw new HttpError(409, "The recipient has no vault to seal to.");
    if (!env.sealed && recipient) throw new HttpError(409, "The recipient has a vault — seal the envelope to it.");
    if (Math.abs(env.createdAt - Date.now()) > 24 * 60 * 60 * 1000) throw new HttpError(400, "Envelope date is more than a day off.");

    const { inserted } = putMessage(env);
    return json({ id: env.id, sealed: env.sealed, inserted }, inserted ? 201 : 200);
  });
}
