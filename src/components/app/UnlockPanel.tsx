"use client";

import { clsx } from "clsx";
import { EnvelopeMark } from "@/components/EnvelopeMark";
import { useVault, type VaultStep } from "@/components/vault/VaultProvider";
import { shortAddress } from "@/lib/format";

/**
 * The door. Everything the first visit needs to know, in three lines, and
 * one button that does connect → sign → (first time) publish. Errors are
 * printed under the button in the wallet's own words.
 */
const STEPS: { key: VaultStep | "done"; label: string; hint: string }[] = [
  { key: "connecting", label: "Connect", hint: "your browser wallet" },
  { key: "unlocking", label: "Sign to unlock", hint: "derives your vault keys on this device" },
  { key: "publishing", label: "Publish keys", hint: "first time only, so others can seal mail to you" },
];

export function UnlockPanel({ title = "Open your inbox", intro }: { title?: string; intro?: string }) {
  const { address, walletAvailable, step, error, unlock, registration } = useVault();
  const busy = step !== "idle";
  const activeIndex = step === "connecting" ? 0 : step === "unlocking" || step === "checking" ? 1 : step === "publishing" ? 2 : -1;

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center px-6 py-14 text-center">
      <div className="relative">
        <div className="absolute inset-[-40%] rounded-full bg-[radial-gradient(closest-side,rgba(95,227,161,0.28),transparent)]" />
        <EnvelopeMark size={112} id="unlock-mark" className="relative" />
      </div>
      <h1 className="display display-md mt-8">{title}</h1>
      <p className="lede mt-4 text-[16px]">
        {intro ?? "One signature unlocks it. Your keys are derived from the signature, on this device, and never stored anywhere."}
      </p>

      <ol className="mt-8 w-full space-y-2 text-left">
        {STEPS.map((s, i) => {
          const done = (i === 0 && Boolean(address)) || (i === 2 && Boolean(registration) && activeIndex < 2 && activeIndex !== -1);
          const active = activeIndex === i;
          return (
            <li key={s.key} className={clsx("glass glass-quiet flex items-center gap-4 rounded-[14px] px-4 py-3", active && "glass-lit")}>
              <span className={clsx("num grid h-7 w-7 place-items-center rounded-full border text-[12px]", done ? "border-mint-2/60 bg-mint-2/15 text-mint" : active ? "border-mint/60 text-ink-0" : "border-[var(--rim)] text-ink-2")}>
                {done ? "✓" : i + 1}
              </span>
              <span className="text-[14.5px] font-medium text-ink-0">{s.label}</span>
              <span className="ml-auto text-right text-[12.5px] text-ink-3">{i === 0 && address ? shortAddress(address) : s.hint}</span>
            </li>
          );
        })}
      </ol>

      <button type="button" className="btn btn-mint mt-8 w-full sm:w-auto" disabled={busy || !walletAvailable} onClick={() => void unlock()}>
        {busy ? (
          <>
            <span className="h-4 w-4 animate-[spin_0.9s_linear_infinite] rounded-full border-2 border-black/20 border-t-black/70" />
            {step === "connecting" ? "Connecting…" : step === "unlocking" ? "Sign in your wallet…" : step === "publishing" ? "Sign to publish…" : "Checking the registry…"}
          </>
        ) : address ? (
          "Unlock with a signature"
        ) : (
          "Connect and unlock"
        )}
      </button>
      {!walletAvailable && <p className="mt-3 text-[13px] text-ink-2">No browser wallet found on this device. Install one (MetaMask, Rabby…) and reload.</p>}
      {error && <p className="mt-3 max-w-[420px] text-[13px] text-bad">{error}</p>}
      <p className="mt-6 text-[12.5px] leading-relaxed text-ink-3">
        Signing is free and is not a transaction. Only sign the unlock message on VAULT MAIL — anyone holding that signature can read your mail.
      </p>
    </div>
  );
}
