import { clsx } from "clsx";

/**
 * A wallet's face: a small glass disc whose two hues come from the address
 * bytes. Deterministic, no library, and the same everywhere it appears.
 */
export function Identicon({ address, size = 34, className }: { address: string; size?: number; className?: string }) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const h1 = parseInt(hex.slice(0, 4), 16) % 360;
  const h2 = (h1 + 40 + (parseInt(hex.slice(4, 8), 16) % 80)) % 360;
  const angle = parseInt(hex.slice(8, 10), 16) % 360;
  return (
    <span
      className={clsx("relative inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(${angle}deg, hsl(${h1} 55% 62%), hsl(${h2} 60% 40%))`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 6px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.14)",
      }}
      aria-hidden
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), rgba(255,255,255,0) 48%)" }}
      />
    </span>
  );
}
