"use client";

import { useState } from "react";

/** Copies the absolute URL of `path` — built from the page's own origin, so it is right on every deployment. */
export function CopyLink({ path, label = "Copy vault link" }: { path: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="hover:text-ink-0"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
