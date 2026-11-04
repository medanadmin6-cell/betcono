"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Page } from "@/components/Shell";
import { useFeed } from "@/lib/feed";

/** Every competition on the board, grouped by country. */
export default function AzMenuPage() {
  const { matches: feed } = useFeed();

  const byCountry = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const m of feed ?? []) {
      const leagues = map.get(m.country) ?? new Map<string, number>();
      leagues.set(m.league, (leagues.get(m.league) ?? 0) + 1);
      map.set(m.country, leagues);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [feed]);

  return (
    <Page rails>
      <h1 className="mb-3 text-[17px] font-black text-[var(--text-bright)]">All competitions</h1>

      {feed === null ? (
        <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">Loading…</p>
      ) : !byCountry.length ? (
        <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">
          Nothing on the board right now.
        </p>
      ) : (
        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0 2xl:grid-cols-3">
          {byCountry.map(([country, leagues]) => (
            <section
              key={country}
              className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]"
            >
              <h2 className="bg-[var(--surface)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {country || "International"}
              </h2>
              <ul className="divide-y divide-[var(--line)]">
                {[...leagues.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([league, count]) => (
                    <li key={league}>
                      <Link
                        href={`/search?q=${encodeURIComponent(league)}`}
                        className="flex items-center justify-between px-3 py-2.5 text-[13px] font-semibold hover:bg-[var(--surface-3)]"
                      >
                        <span>{league}</span>
                        <span className="text-[11px] tabular-nums text-[var(--text-faint)]">{count}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
