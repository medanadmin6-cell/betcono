"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Page } from "@/components/Shell";
import { MatchList } from "@/components/MatchList";
import { BetSlip } from "@/components/BetSlip";
import { SupportChat } from "@/components/SupportChat";
import { WinnersTicker } from "@/components/WinnersTicker";
import { HeroBanner, SportTiles, SportPills, FilterBar } from "@/components/home/Panels";
import { RecommendedCodes } from "@/components/home/RecommendedCodes";
import { NewsStrip } from "@/components/home/NewsStrip";
import type { FeedMatch } from "@/lib/fixtures";

const POLL_MS = 30_000;

/**
 * The home page, laid out like the reference: hero banner, sport tiles, sport
 * pills, the live winners ticker, then a search + filter bar over one full
 * events board.
 */
export function HomeBoard() {
  const tab = useSearchParams().get("tab");
  const [feed, setFeed] = useState<FeedMatch[] | null>(null);
  const [filter, setFilter] = useState("");

  // The home page shares one poll with the board below it.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/fixtures", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (alive) setFeed(json.matches ?? []);
      } catch {
        /* the board below renders its own error state */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  /** Boosted prices lead the board; both passes are stable, so the custom-match
      ordering inside `MatchList` survives this. */
  const homeFeed = useMemo(() => {
    if (!feed) return feed;
    return [...feed.filter((m) => m.bestOdds), ...feed.filter((m) => !m.bestOdds)];
  }, [feed]);

  // A tab in the URL means the player came from a chip or a nav link and wants
  // the full board on that cut, not the home furniture.
  if (tab) {
    return (
      <Page>
        <div className="px-2 pt-2 md:px-5 md:pt-4">
          <MatchList tab={tab} />
        </div>
        <BetSlip />
        <SupportChat />
      </Page>
    );
  }

  return (
    <Page>
      <HeroBanner />
      <SportTiles />
      <SportPills />

      <div className="mx-2.5 mt-2 md:mx-5">
        <WinnersTicker />
      </div>

      <RecommendedCodes />

      <FilterBar active={filter} onChange={setFilter} />

      <div className="mx-2.5 mb-2 flex items-center justify-between md:mx-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-[var(--lose)]" />
          <h2 className="text-[14px] font-black uppercase tracking-tight text-[var(--text-bright)]">
            Soccer Events &amp; Markets
          </h2>
        </div>
        <span className="text-[11px] font-extrabold text-[var(--accent)]">
          {feed === null ? "Loading matches…" : `${feed.length} events`}
        </span>
      </div>

      <div className="px-2 md:px-5">
        <MatchList tab={filter} matches={homeFeed} />
      </div>

      <NewsStrip />

      <BetSlip />
      <SupportChat />
    </Page>
  );
}
