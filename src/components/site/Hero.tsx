"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EnvelopeMark } from "@/components/EnvelopeMark";
import { LiveStats } from "@/components/site/LiveStats";
import { asAddress } from "@/lib/format";
import { site } from "@/lib/site";

const GlassEnvelope = dynamic(() => import("@/components/three/GlassEnvelope").then((m) => m.GlassEnvelope), { ssr: false });

/**
 * The first screen: the glass envelope, lit, on the right; the sentence on
 * the left. The scene is full-bleed behind the copy so its light is the
 * page's light; when WebGL is missing the flat mark takes its place.
 */
export function Hero() {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [flat, setFlat] = useState(false);
  const target = asAddress(to);

  return (
    <section className="relative min-h-[100svh] overflow-clip" aria-label="Intro">
      <div className="absolute inset-0">
        {flat ? (
          <div className="absolute inset-0 flex items-center justify-center lg:justify-end lg:pr-[10vw]">
            <div className="relative h-[46vw] max-h-[520px] w-[46vw] max-w-[520px]">
              <div className="absolute inset-[-30%] rounded-full bg-[radial-gradient(closest-side,rgba(95,227,161,0.35),transparent)]" />
              <EnvelopeMark size={520} id="hero-flat" className="relative h-full w-full" />
            </div>
          </div>
        ) : (
          <GlassEnvelope className="absolute inset-0" onUnsupported={() => setFlat(true)} />
        )}
        {/* Let the black of the page take over at the bottom edge so the section blends into what follows. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-void" />
      </div>

      <div className="shell relative flex min-h-[100svh] flex-col justify-end pb-14 pt-[calc(var(--nav-h)+46vh)] lg:justify-center lg:pb-0 lg:pt-[var(--nav-h)]">
        <div className="max-w-[620px]">
          <p className="eyebrow reveal is-in mb-6 flex items-center gap-3">
            <span className="dot dot-live" />
            Wallet-to-wallet mail · sealed end-to-end
          </p>
          <h1 className="display display-xl">
            Your wallet
            <br />
            has an inbox.
          </h1>
          <p className="lede mt-7 max-w-[520px]">{site.tagline}</p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/inbox" className="btn btn-mint">
              Open your inbox
            </Link>
            <Link href="/protocol" className="btn btn-glass">
              How it is sealed
            </Link>
          </div>

          <form
            className="glass glass-quiet mt-10 flex max-w-[560px] items-center gap-2 rounded-full p-1.5 pl-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (target) router.push(`/compose?to=${target}`);
            }}
          >
            <EnvelopeMark size={22} id="hero-field" glow={false} className="shrink-0 opacity-80" />
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Write to a wallet — paste a 0x… address"
              className="field-mono min-w-0 flex-1 bg-transparent text-[14px] text-ink-0 outline-none placeholder:text-ink-3"
              spellCheck={false}
              autoComplete="off"
              aria-label="Wallet address to write to"
            />
            <button type="submit" className="btn btn-sm btn-glass" disabled={!target}>
              Write
            </button>
          </form>

          <LiveStats className="mt-6" />
        </div>
      </div>
    </section>
  );
}
