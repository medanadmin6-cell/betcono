"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * The wide breakpoint (Tailwind's `xl`), where the bet slip stops being a
 * sheet and docks in the right rail.
 */
const QUERY = "(min-width: 1280px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** False on the server and until the first client read, so markup matches. */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/**
 * True inside a page that has the docked slip rail. A sheet-style BetSlip
 * on such a page steps aside on wide screens so only one slip is mounted.
 */
export const SlipDockContext = createContext(false);

export function useSlipDocked(): boolean {
  const docked = useContext(SlipDockContext);
  const wide = useWide();
  return docked && wide;
}
