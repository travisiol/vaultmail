import { BODY_PATH, FLAP_PATH, MARK_SIZE, TILE_PATH } from "@/lib/markPaths";

/**
 * The flat mark: the hero object drawn in SVG from the same outlines. Used in
 * the nav, the favicon, the OG image and wherever WebGL is missing. Glass is
 * suggested with three gradients — a milky fill, a rim that is white on top
 * and mint below, and a satin envelope — no raster.
 */
export function EnvelopeMark({ size = 28, className, id = "mark", glow = true }: { size?: number; className?: string; id?: string; glow?: boolean }) {
  const s = MARK_SIZE;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${s} ${s}`} className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="52%" r="50%">
          <stop offset="0%" stopColor="#dffff0" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#8ff0c2" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#3aa574" stopOpacity="0.08" />
        </radialGradient>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#9ff5cb" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#8ff0c2" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${id}-env`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f2f8f5" />
          <stop offset="100%" stopColor="#c0cfc7" />
        </linearGradient>
        <linearGradient id={`${id}-flap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7fbf9" />
          <stop offset="100%" stopColor="#cbd9d1" />
        </linearGradient>
      </defs>
      {glow && <path d={TILE_PATH} fill={`url(#${id}-glow)`} />}
      <path d={TILE_PATH} fill={`url(#${id}-tile)`} stroke={`url(#${id}-rim)`} strokeWidth="1.8" />
      <path d={BODY_PATH} fill={`url(#${id}-env)`} stroke="rgba(255,255,255,0.7)" strokeWidth="0.9" strokeLinejoin="round" />
      <path d={FLAP_PATH} fill={`url(#${id}-flap)`} stroke="rgba(255,255,255,0.8)" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}
