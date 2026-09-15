import { verifyMessage } from "viem";
import { isAddress, isHex, lower } from "@/lib/protocol/encoding";
import { registrationMessage } from "@/lib/protocol/keys";
import { PROTOCOL_VERSION, type Registration } from "@/lib/protocol/types";
import { handle, HttpError, json, readJson } from "@/lib/server/http";
import { getVault, putVault } from "@/lib/server/store";

export const runtime = "nodejs";

/**
 * POST /api/keys — publish a wallet's vault keys.
 *
 * The only proof accepted is the wallet's own EIP-191 signature over the
 * registration text, checked here with viem. The server cannot invent or
 * swap a registration: it would need the wallet's private key.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const raw = await req.text();
    const body = await readJson<Partial<Registration>>(req, raw);
    if (body.v !== PROTOCOL_VERSION) throw new HttpError(400, "Unsupported protocol version.");
    if (!isAddress(body.address)) throw new HttpError(400, "Address malformed.");
    if (!isHex(body.sealPub, 32) || !isHex(body.signPub, 32)) throw new HttpError(400, "Keys must be 32-byte hex strings.");
    if (typeof body.walletSig !== "string" || !/^0x[0-9a-fA-F]{130,}$/.test(body.walletSig)) throw new HttpError(400, "Wallet signature malformed.");

    const address = lower(body.address);
    const message = registrationMessage(address, body.sealPub, body.signPub);
    const ok = await verifyMessage({ address, message, signature: body.walletSig as `0x${string}` }).catch(() => false);
    if (!ok) throw new HttpError(401, "The wallet signature does not match this registration.");

    const existing = getVault(address);
    const reg = putVault({ v: PROTOCOL_VERSION, address, sealPub: body.sealPub, signPub: body.signPub, walletSig: body.walletSig as `0x${string}` });
    return json({ registration: reg, replaced: Boolean(existing && (existing.sealPub !== reg.sealPub || existing.signPub !== reg.signPub)) }, existing ? 200 : 201);
  });
}
