import "server-only";
import { createPublicClient, erc20Abi, http, parseEventLogs, type Hex } from "viem";
import { chain, CHAIN_ID } from "../chain";
import { lower } from "../protocol/encoding";
import type { Address } from "../protocol/types";
import { HttpError } from "./http";

/**
 * A receipt is only ever what the chain says. The payer hands us a
 * transaction hash; we read the transaction and its receipt from the RPC and
 * accept it as payment of an envelope only if it succeeded, was sent by the
 * envelope's recipient (the payer) and moved value to the envelope's sender
 * (the payee) — either the native currency or an ERC-20 `Transfer`.
 *
 * The *requested* amount is sealed inside the envelope, so the server never
 * compares it. It records what was actually paid; each side's client, which
 * can open the envelope, shows "paid in full" or "partial".
 */

declare global {
  var __vaultmailRpc: ReturnType<typeof createPublicClient> | undefined;
}

/**
 * The server's own view of the chain. `VAULT_CHAIN_ID` / `VAULT_RPC_URL`
 * are read at runtime (not inlined at build time like NEXT_PUBLIC_*), so
 * the end-to-end script can point a running server at a local node.
 */
export function serverChainId(): number {
  return Number(process.env.VAULT_CHAIN_ID ?? CHAIN_ID);
}

function rpc() {
  if (!globalThis.__vaultmailRpc) {
    const url = process.env.VAULT_RPC_URL?.trim() || chain.rpcUrls.default.http[0];
    globalThis.__vaultmailRpc = createPublicClient({ chain: serverChainId() === chain.id ? chain : undefined, transport: http(url) });
  }
  return globalThis.__vaultmailRpc;
}

export type VerifiedPayment = { chainId: number; token: string; amount: string; blockNumber: number };

export async function verifyPayment(txHash: Hex, payer: Address, payee: Address): Promise<VerifiedPayment> {
  const client = rpc();
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: txHash }).catch(() => null),
    client.getTransactionReceipt({ hash: txHash }).catch(() => null),
  ]);
  if (!tx || !receipt) throw new HttpError(404, "That transaction is not on the chain yet. Wait for it to confirm and try again.");
  if (receipt.status !== "success") throw new HttpError(422, "That transaction reverted.");
  if (lower(tx.from) !== payer) throw new HttpError(403, "That transaction was not sent by the wallet this invoice is addressed to.");

  if (tx.to && lower(tx.to) === payee && tx.value > 0n) {
    return { chainId: serverChainId(), token: "native", amount: tx.value.toString(), blockNumber: Number(receipt.blockNumber) };
  }

  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs, strict: false });
  const hit = transfers.find((log) => log.args.from && log.args.to && lower(log.args.from) === payer && lower(log.args.to) === payee && (log.args.value ?? 0n) > 0n);
  if (hit && hit.args.value) {
    return { chainId: serverChainId(), token: lower(hit.address), amount: hit.args.value.toString(), blockNumber: Number(receipt.blockNumber) };
  }
  throw new HttpError(422, "That transaction does not move anything from the payer to the payee.");
}
