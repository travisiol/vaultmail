"use client";

import { useState } from "react";
import { erc20Abi, type Hex } from "viem";
import { usePublicClient, useSendTransaction, useWriteContract } from "wagmi";
import { useVault } from "@/components/vault/VaultProvider";
import { chain } from "@/lib/chain";
import { api, ApiError } from "@/lib/client/api";
import { useInvalidateMail, type OpenedMessage } from "@/lib/client/mail";
import { formatAmount, paidTowards, toBaseUnits } from "@/lib/format";

/**
 * Pay what an envelope asks, from the envelope. One ordinary transfer —
 * native or ERC-20 — from the reader's wallet straight to the sender, then
 * the hash is handed to the server, which reads the transaction back from
 * the chain before pinning it as a receipt. Nothing passes through us.
 *
 * If the server is slower than the chain (it reads through its own RPC),
 * the hash is kept and "Attach receipt" retries without paying twice.
 */
type Phase = "idle" | "confirm" | "mining" | "attaching" | "done";

export function PayButton({ message }: { message: OpenedMessage }) {
  const { keys, wrongChain, switchChain } = useVault();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const invalidate = useInvalidateMail(keys);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingHash, setPendingHash] = useState<Hex | null>(null);

  const p = message.payload;
  if (!keys || !p || p.kind === "message" || !p.amount || !p.token) return null;
  const token = p.token;
  const total = toBaseUnits(p.amount, token.decimals);
  const paid = paidTowards(message.receipts, token);
  const remaining = total > paid ? total - paid : 0n;
  if (remaining === 0n) return null;

  const attach = async (hash: Hex) => {
    setPhase("attaching");
    try {
      await api.attachReceipt(keys, message.id, hash);
      setPendingHash(null);
      setPhase("done");
      invalidate();
    } catch (err) {
      setPendingHash(hash);
      setPhase("idle");
      setError(err instanceof ApiError ? err.message : "Paid, but the receipt could not be attached yet. Try again in a moment.");
    }
  };

  const pay = async () => {
    setError(null);
    try {
      setPhase("confirm");
      const to = message.envelope.from;
      let hash: Hex;
      if (token.kind === "native") {
        hash = await sendTransactionAsync({ to, value: remaining, chainId: chain.id });
      } else {
        hash = await writeContractAsync({ abi: erc20Abi, address: token.address, functionName: "transfer", args: [to, remaining], chainId: chain.id });
      }
      setPendingHash(hash);
      setPhase("mining");
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      await attach(hash);
    } catch (err) {
      const msg = (err as { shortMessage?: string; message?: string }).shortMessage ?? (err as Error).message ?? "Payment failed.";
      setError(msg.split("\n")[0].slice(0, 160));
      setPhase("idle");
    }
  };

  const busy = phase !== "idle" && phase !== "done";
  const label =
    phase === "confirm" ? "Confirm in your wallet…" : phase === "mining" ? "Waiting for the chain…" : phase === "attaching" ? "Attaching the receipt…" : `Pay ${formatAmount(p.amount, token)}`;

  return (
    <div className="flex flex-col gap-2">
      {wrongChain ? (
        <button type="button" className="btn btn-glass" onClick={() => void switchChain()}>
          Switch to {chain.name} to pay
        </button>
      ) : pendingHash && !busy ? (
        <button type="button" className="btn btn-mint" onClick={() => void attach(pendingHash)}>
          Attach receipt for {pendingHash.slice(0, 10)}…
        </button>
      ) : (
        <button type="button" className="btn btn-mint" disabled={busy} onClick={() => void pay()}>
          {busy && <span className="h-4 w-4 animate-[spin_0.9s_linear_infinite] rounded-full border-2 border-black/20 border-t-black/70" />}
          {label}
        </button>
      )}
      {paid > 0n && <p className="text-[12.5px] text-ink-3">Remaining after what was already paid.</p>}
      {error && <p className="max-w-[360px] text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}
