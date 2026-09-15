import { randomBytes } from "@noble/hashes/utils";
import { bytesToHex, isHex, lower } from "@/lib/protocol/encoding";
import { handle, HttpError, json, readJson, requireVault } from "@/lib/server/http";
import { serverChainId, verifyPayment } from "@/lib/server/payments";
import { getMessage, putReceipt, receiptByTx } from "@/lib/server/store";

export const runtime = "nodejs";

/**
 * POST /api/messages/:id/receipts { txHash } — attach a payment to an
 * envelope. Only the envelope's recipient (the one being asked to pay) may
 * call it, and only a transaction the chain confirms as a transfer from them
 * to the sender is recorded. One transaction pays one envelope.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!isHex(id, 16)) throw new HttpError(400, "Message id malformed.");
    const raw = await req.text();
    const address = requireVault(req, raw);
    const body = await readJson<{ txHash?: string }>(req, raw);
    if (typeof body.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) throw new HttpError(400, "txHash malformed.");
    const txHash = lower(body.txHash) as `0x${string}`;

    const message = getMessage(id);
    if (!message || message.recipient !== address) throw new HttpError(404, "No such request in this inbox.");
    const existing = receiptByTx(serverChainId(), txHash);
    if (existing) {
      if (existing.messageId === id) return json({ receipt: existing, inserted: false });
      throw new HttpError(409, "That transaction already paid another envelope.");
    }

    const paid = await verifyPayment(txHash, address, message.sender);
    const receipt = {
      id: bytesToHex(randomBytes(12)),
      messageId: id,
      chainId: paid.chainId,
      txHash,
      payer: address,
      payee: message.sender,
      token: paid.token,
      amount: paid.amount,
      blockNumber: paid.blockNumber,
      verifiedAt: Date.now(),
    };
    const { inserted } = putReceipt(receipt);
    return json({ receipt, inserted }, inserted ? 201 : 200);
  });
}
