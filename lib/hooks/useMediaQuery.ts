"use client";

import { useEffect, useState } from "react";

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 * Safe for SSR: returns `false` on the server and during the first client
 * render, then syncs to the real value after mount (avoids hydration
 * mismatches since the server has no concept of viewport width).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    setMatches(mediaQueryList.matches);

    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQueryList.addEventListener("change", listener);
    return () => mediaQueryList.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

/**
 * True below the `lg` breakpoint (1024px) — the point at which the
 * dashboard switches from a fixed sidebar to a collapsible mobile nav.
 */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
