"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DEFAULT_PARAMS, GlassEnvelope, type GlassParams } from "@/components/three/GlassEnvelope";

/**
 * Side-by-side variants of the hero object, for judging one capture at a
 * time instead of ten round-trips in the app. Dev only; not linked.
 *   /lab/glass                → the default four
 *   /lab/glass?v=a,b,c        → a subset
 *   /lab/glass?w=900&h=700    → cell size
 */
const VARIANTS: Record<string, Partial<GlassParams>> = {
  base: {},
  lightbox: { spread: 1.6, backlightPeak: 1.1 },
  softer: { tileRoughness: 0.36, spread: 1.45 },
  sides: { sideLight: 1.8 },
  satinClear: { tileRoughness: 0.2, tileThickness: 0.9 },
  frosted: { tileRoughness: 0.5, tileThickness: 1.4, bloom: 0.55 },
  glassEnvelope: { envelopeMode: "glass" },
  bright: { exposure: 1.3, backlight: 1.2, bloom: 0.5 },
  moody: { exposure: 0.9, backlight: 0.7, greenStrength: 4.5, tileTint: "#bff5da" },
  centered: { offsetX: 0, scale: 1.15 },
};

function Lab() {
  const sp = useSearchParams();
  const names = (sp.get("v") ?? "base,satinClear,frosted,glassEnvelope").split(",").filter((n) => n in VARIANTS);
  const w = Number(sp.get("w") ?? 700);
  const h = Number(sp.get("h") ?? 560);
  return (
    <main style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 8, background: "#040605" }}>
      {names.map((name) => (
        <figure key={name} style={{ margin: 0, width: w }}>
          <div style={{ width: w, height: h, borderRadius: 12, overflow: "hidden" }}>
            <GlassEnvelope still params={{ offsetX: 0, ...VARIANTS[name] }} className="h-full w-full" />
          </div>
          <figcaption className="addr" style={{ color: "#8b968f", padding: "6px 4px" }}>
            {name} · {JSON.stringify({ ...DEFAULT_PARAMS, ...VARIANTS[name] })}
          </figcaption>
        </figure>
      ))}
    </main>
  );
}

export function GlassLab() {
  return (
    <Suspense>
      <Lab />
    </Suspense>
  );
}
