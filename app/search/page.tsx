"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Page } from "@/components/Shell";
import { MatchList } from "@/components/MatchList";
import { useFeed } from "@/lib/feed";

/** Search across the merged feed: teams, leagues and countries. */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchBoard />
    </Suspense>
  );
}

function SearchBoard() {
  // League links and the header box arrive as /search?q=..., so the term
  // from the URL is the starting value.
  const initial = useSearchParams().get("q") ?? "";
  const { matches: feed } = useFeed();
  const [q, setQ] = useState(initial);
  // A new search from the header while already on this page changes the URL,
  // not the mount, so the box follows the URL when it moves.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setQ(initial);
  }

  const results = useMemo(() => {
    if (!feed) return null;
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return feed.filter((m) =>
      `${m.homeTeam} ${m.awayTeam} ${m.league} ${m.country}`.toLowerCase().includes(term),
    );
  }, [feed, q]);

  return (
    <Page rails>
      <div className="relative mb-3">
        <Search
          size={16}
          strokeWidth={2.2}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search teams, competitions or countries"
          aria-label="Search teams, competitions or countries"
          autoFocus={!initial}
          className="w-full rounded-md border border-[var(--field-line)] bg-[var(--input)] py-2.5 pl-9 pr-3 text-[14px] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:border-[var(--accent)]"
        />
      </div>

      {!q.trim() ? (
        <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">
          Type to search {feed?.length ?? 0} matches on the board.
        </p>
      ) : (
        <MatchList matches={results} emptyLabel={`Nothing matching "${q}".`} />
      )}
    </Page>
  );
}
