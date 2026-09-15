"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConnect, useConnection, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { chain } from "@/lib/chain";
import { api } from "@/lib/client/api";
import { deriveVaultKeys, matchesRegistration, registrationDraft, registrationMessage, unlockMessage, type VaultKeys } from "@/lib/protocol/keys";
import type { Address, Registration } from "@/lib/protocol/types";

/**
 * The vault, shared by every screen.
 *
 *   connect  → the injected wallet, on the configured chain when it agrees
 *   unlock   → one signature; the keys are derived here and never leave
 *              this tab's memory (a reload locks the vault again)
 *   publish  → first time only: a second signature puts the public keys in
 *              the registry so other wallets can seal mail to this one
 *
 * `mismatch` is the honest case where the wallet signed differently from the
 * day it registered (some hardware and contract wallets do): the vault is
 * open with today's keys, older mail will not open, and the user decides
 * whether to republish.
 */

export type VaultStep = "idle" | "connecting" | "unlocking" | "publishing" | "checking";

type Ctx = {
  /** Connected wallet, if any. */
  address: Address | undefined;
  chainId: number | undefined;
  wrongChain: boolean;
  walletAvailable: boolean;
  /** Unlocked keys for `address`, or null while locked. */
  keys: VaultKeys | null;
  registration: Registration | null;
  mismatch: boolean;
  step: VaultStep;
  error: string | null;
  connect: () => Promise<Address | undefined>;
  unlock: () => Promise<VaultKeys | undefined>;
  republish: () => Promise<void>;
  lock: () => void;
  disconnect: () => Promise<void>;
  switchChain: () => Promise<void>;
  clearError: () => void;
};

const VaultContext = createContext<Ctx | null>(null);

/** Is there actually a wallet in this browser? The injected connector is always listed, so its presence says nothing. */
function useWalletAvailable(): boolean {
  const [available, setAvailable] = useState(true);
  useEffect(() => {
    let found = typeof window !== "undefined" && "ethereum" in window;
    const onAnnounce = () => {
      found = true;
      setAvailable(true);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timer = window.setTimeout(() => setAvailable(found), 500);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);
  return available;
}

function firstLine(err: unknown, fallback: string): string {
  const msg = (err as { shortMessage?: string; message?: string })?.shortMessage ?? (err as Error)?.message ?? fallback;
  return String(msg).split("\n")[0].slice(0, 180);
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const { address: rawAddress, isConnected, chainId } = useConnection();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const walletAvailable = useWalletAvailable();

  const address = rawAddress ? (rawAddress.toLowerCase() as Address) : undefined;
  const [keys, setKeys] = useState<VaultKeys | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [step, setStep] = useState<VaultStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const lock = useCallback(() => {
    setKeys(null);
    setRegistration(null);
    setMismatch(false);
  }, []);

  // A different account in the wallet means a different vault: lock.
  const lastAddress = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastAddress.current !== undefined && lastAddress.current !== address) lock();
    lastAddress.current = address;
  }, [address, lock]);

  const connect = useCallback(async (): Promise<Address | undefined> => {
    if (isConnected && address) return address;
    const connector = connectors[0];
    if (!connector || !walletAvailable) throw new Error("No browser wallet found — install one to open a vault.");
    setStep("connecting");
    try {
      const result = await connectAsync({ connector });
      const account = result.accounts[0]?.toLowerCase() as Address | undefined;
      if (result.chainId !== chain.id) {
        try {
          await switchChainAsync({ chainId: chain.id });
        } catch {
          /* signing works on any chain; only payments need this one */
        }
      }
      return account;
    } finally {
      setStep("idle");
    }
  }, [address, connectAsync, connectors, isConnected, switchChainAsync, walletAvailable]);

  const publishFor = useCallback(
    async (k: VaultKeys) => {
      const draft = registrationDraft(k);
      setStep("publishing");
      const walletSig = await signMessageAsync({ account: k.address, message: registrationMessage(k.address, draft.sealPub, draft.signPub) });
      const { registration: reg } = await api.publish({ ...draft, walletSig });
      setRegistration(reg);
      setMismatch(false);
    },
    [signMessageAsync],
  );

  const unlock = useCallback(async (): Promise<VaultKeys | undefined> => {
    setError(null);
    try {
      const account = await connect();
      if (!account) throw new Error("The wallet did not return an account.");
      setStep("unlocking");
      const sig = await signMessageAsync({ account, message: unlockMessage(account) });
      const k = deriveVaultKeys(account, sig);
      setStep("checking");
      const existing = await api.keysOf(account);
      if (!existing) {
        await publishFor(k);
      } else {
        setRegistration(existing);
        setMismatch(!matchesRegistration(k, existing));
      }
      setKeys(k);
      return k;
    } catch (err) {
      setError(firstLine(err, "Could not unlock the vault."));
      return undefined;
    } finally {
      setStep("idle");
    }
  }, [connect, publishFor, signMessageAsync]);

  const republish = useCallback(async () => {
    if (!keys) return;
    setError(null);
    try {
      await publishFor(keys);
    } catch (err) {
      setError(firstLine(err, "Could not publish the keys."));
    } finally {
      setStep("idle");
    }
  }, [keys, publishFor]);

  const disconnect = useCallback(async () => {
    lock();
    try {
      await disconnectAsync();
    } catch {
      /* already disconnected */
    }
  }, [disconnectAsync, lock]);

  const switchChain = useCallback(async () => {
    setError(null);
    try {
      await switchChainAsync({ chainId: chain.id });
    } catch (err) {
      setError(firstLine(err, "Could not switch network."));
    }
  }, [switchChainAsync]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<Ctx>(
    () => ({
      address,
      chainId,
      wrongChain: isConnected && chainId !== undefined && chainId !== chain.id,
      walletAvailable,
      keys: keys && keys.address === address ? keys : null,
      registration,
      mismatch,
      step,
      error,
      connect,
      unlock,
      republish,
      lock,
      disconnect,
      switchChain,
      clearError,
    }),
    [address, chainId, isConnected, walletAvailable, keys, registration, mismatch, step, error, connect, unlock, republish, lock, disconnect, switchChain, clearError],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): Ctx {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault outside VaultProvider");
  return ctx;
}
