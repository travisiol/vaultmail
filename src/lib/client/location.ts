"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Query parameters without `useSearchParams`: that hook bails the whole
 * page out of prerendering and, in dev, its Suspense boundary can sit
 * un-hydrated until the first click. The URL itself is the store here —
 * `history.pushState` (which Next's router listens to) plus one event.
 */
const EVENT = "vaultmail:location";

export function navigate(url: string, replace = false) {
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useLocationSearch(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );
  return useMemo(() => new URLSearchParams(search), [search]);
}
