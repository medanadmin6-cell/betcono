"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Page } from "@/components/Shell";
import { MatchList, filterMatches } from "@/components/MatchList";
import { SupportChat } from "@/components/SupportChat";
import { WinnersTicker } from "@/components/WinnersTicker";
import { HeroBanner, Shortcuts, SectionHeading, FilterBar } from "@/components/home/Panels";
import { FeaturedMatches } from "@/components/home/FeaturedMatches";
import { RecommendedCodes } from "@/components/home/RecommendedCodes";
import { NewsStrip } from "@/components/home/NewsStrip";
import { useFeed } from "@/lib/feed";
import { useNow } from "@/lib/now";

const TAB_TITLES: Record<string, string> = {
  live: "Live now",
  today: "Today",
  tomorrow: "Tomorrow",
  boosted: "Boosted odds",
  soon: "Starting soon",
  upcoming: "Upcoming",
};

/**
 * The home page: banner, shortcuts, a featured strip (live games, or the next
 * kickoffs when nothing is in play), recommended codes, then the full board
 * under a day filter. A `?tab=` in the URL skips the furniture and shows the
 * board on that cut alone.
 */
export function HomeBoard() {
  const tab = useSearchParams().get("tab");
  const { matches: feed } = useFeed();
  const [filter, setFilter] = useState("");
  const now = useNow();

  /** Boosted prices lead the board; both passes are stable, so the custom-match
      ordering inside `MatchList` survives this. */
  const homeFeed = useMemo(() => {
    if (!feed) return feed;
    return [...feed.filter((m) => m.bestOdds), ...feed.filter((m) => !m.bestOdds)];
  }, [feed]);

  const featured = useMemo(() => {
    if (!feed) return { live: false, list: [] };
    const live = feed.filter((m) => m.isLive && !m.isLocked);
    if (live.length) return { live: true, list: live.slice(0, 8) };
    const next = filterMatches(feed, "upcoming", now)
      .slice()
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    return { live: false, list: next.slice(0, 8) };
  }, [feed, now]);

  const count = useMemo(
    () => (homeFeed ? filterMatches(homeFeed, filter, now).length : null),
    [homeFeed, filter, now],
  );

  // A tab in the URL means the player came from a section link and wants the
  // full board on that cut, not the home furniture.
  if (tab) {
    return (
      <Page rails>
        <SectionHeading title={TAB_TITLES[tab] ?? "Matches"} live={tab === "live"} />
        <MatchList tab={tab} />
        <SupportChat />
      </Page>
    );
  }

  return (
    <Page rails>
      <div className="space-y-4">
        <HeroBanner />
        <Shortcuts />
        <WinnersTicker />

        {featured.list.length > 0 && (
          <section>
            <SectionHeading
              title={featured.live ? "Live now" : "Starting next"}
              live={featured.live}
            />
            <FeaturedMatches matches={featured.list} />
          </section>
        )}

        <RecommendedCodes />

        <section>
          <SectionHeading
            title="Football"
            aside={
              <span className="text-[11px] font-bold text-[var(--text-faint)]">
                {count === null ? "Loading…" : `${count} events`}
              </span>
            }
          />
          <FilterBar active={filter} onChange={setFilter} />
          <MatchList tab={filter} matches={homeFeed} />
        </section>

        <NewsStrip />
      </div>

      <SupportChat />
    </Page>
  );
}
