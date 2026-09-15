/**
 * Small glass glyphs for the three kinds of mail. Same language as the mark:
 * a milky tile with a lit rim, one white-on-mint drawing inside.
 */
function Tile({ id, children, size = 56 }: { id: string; children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#9ff5cb" stopOpacity="0.14" />
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#8ff0c2" stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id={`${id}-g`} cx="50%" cy="60%" r="55%">
          <stop offset="0%" stopColor="#9ff5cb" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#9ff5cb" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="52" height="52" rx="15" fill={`url(#${id}-g)`} />
      <rect x="2" y="2" width="52" height="52" rx="15" fill={`url(#${id}-t)`} stroke={`url(#${id}-r)`} strokeWidth="1.4" />
      <g fill="none" stroke="#eefbf4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export function MessageGlyph({ id = "g-msg" }: { id?: string }) {
  return (
    <Tile id={id}>
      <rect x="15" y="19" width="26" height="18" rx="4" />
      <path d="M16 21l12 9 12-9" />
    </Tile>
  );
}

export function InvoiceGlyph({ id = "g-inv" }: { id?: string }) {
  return (
    <Tile id={id}>
      <path d="M18 14h20v28l-3.3-2.4-3.3 2.4-3.4-2.4-3.3 2.4-3.4-2.4L18 42z" />
      <path d="M23 22h10M23 27h10M23 32h6" strokeOpacity="0.85" />
    </Tile>
  );
}

export function RequestGlyph({ id = "g-req" }: { id?: string }) {
  return (
    <Tile id={id}>
      <circle cx="28" cy="28" r="11" />
      <path d="M28 21.5v13M24.5 25.5h5.2a2.3 2.3 0 010 4.6h-3.4a2.3 2.3 0 000 4.6H31" />
    </Tile>
  );
}

export function SealGlyph({ id = "g-seal" }: { id?: string }) {
  return (
    <Tile id={id}>
      <rect x="17" y="25" width="22" height="16" rx="4" />
      <path d="M21 25v-4a7 7 0 0114 0v4" />
      <circle cx="28" cy="33" r="1.6" fill="#eefbf4" />
    </Tile>
  );
}

export function KeyGlyph({ id = "g-key" }: { id?: string }) {
  return (
    <Tile id={id}>
      <circle cx="22" cy="30" r="6" />
      <path d="M27 27l12-12M34 20l3 3M31 23l3 3" />
    </Tile>
  );
}

export function ChainGlyph({ id = "g-chain" }: { id?: string }) {
  return (
    <Tile id={id}>
      <path d="M24 32l-3 3a5 5 0 01-7-7l6-6a5 5 0 017 0M32 24l3-3a5 5 0 017 7l-6 6a5 5 0 01-7 0" />
      <path d="M24 32l8-8" strokeOpacity="0.8" />
    </Tile>
  );
}
