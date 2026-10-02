"use client";

import { useEffect } from "react";

const KEY = "tokens.do:visit";

/** Pings /api/visit once per browser tab session. Runs client-side only, so crawlers and prefetches don't count. */
export function VisitBeacon() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      // Storage blocked: still count; the server dedupes per day.
    }
    navigator.sendBeacon?.("/api/visit");
  }, []);
  return null;
}
