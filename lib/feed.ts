"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { FeedMatch } from "@/lib/fixtures";

/**
 * One fixtures poll for the whole page.
 *
 * The board, the sidebar's league list and the live strip all read the same
 * feed, so they subscribe here instead of each opening their own interval.
 * The poll runs while at least one component is mounted on it.
 */

const POLL_MS = 30_000;

interface FeedState {
  matches: FeedMatch[] | null;
  error: string | null;
  subscribers: number;
}

const useFeedStore = create<FeedState>(() => ({ matches: null, error: null, subscribers: 0 }));

let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try {
    const res = await fetch("/api/fixtures", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    useFeedStore.setState({ matches: json.matches ?? [], error: null });
  } catch {
    useFeedStore.setState({ error: "Could not load matches. Retrying…" });
  }
}

function subscribe() {
  const n = useFeedStore.getState().subscribers + 1;
  useFeedStore.setState({ subscribers: n });
  if (n === 1) {
    void load();
    timer = setInterval(load, POLL_MS);
  }
  return () => {
    const left = useFeedStore.getState().subscribers - 1;
    useFeedStore.setState({ subscribers: left });
    if (left === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The shared feed. Pass `enabled: false` to read nothing and poll nothing. */
export function useFeed(enabled = true) {
  const matches = useFeedStore((s) => s.matches);
  const error = useFeedStore((s) => s.error);

  useEffect(() => {
    if (!enabled) return;
    return subscribe();
  }, [enabled]);

  return { matches: enabled ? matches : null, error: enabled ? error : null };
}
