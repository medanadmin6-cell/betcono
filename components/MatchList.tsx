"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Lock, ChevronRight, Zap } from "lucide-react";
import { useSlip, type SlipLeg } from "@/lib/store";
import { useNow } from "@/lib/now";
import { useFeed } from "@/lib/feed";
import type { FeedMatch } from "@/lib/fixtures";

/**
 * The fixture board: one market at a time, grouped by competition.
 *
 * Reads the shared fixtures poll (lib/feed) unless a parent hands a feed in.
 * That poll is also what drives settlement and goal alerts server-side.
 */

const MARKET_TABS = [
  { key: "1x2", label: "1X2", cols: ["1", "X", "2"] },
  { key: "ou25", label: "Total 2.5", cols: ["O2.5", "U2.5"] },
  { key: "dc", label: "Double Chance", cols: ["1X", "12", "X2"] },
  { key: "ou15", label: "Total 1.5", cols: ["O1.5", "U1.5"] },
  { key: "btts", label: "GG/NG", cols: ["GG", "NG"] },
];

/** Shared by the column labels and the buttons, so the two always line up. */
const ODDS_W = "w-[58px] md:w-[78px]";

export function filterMatches(matches: FeedMatch[], tab: string, now: number): FeedMatch[] {
  if (tab === "live") return matches.filter((m) => m.isLive);
  if (tab === "boosted") return matches.filter((m) => m.bestOdds);
  if (tab === "soon") {
    const cutoff = now + 3 * 3_600_000;
    return matches.filter((m) => !m.isLive && new Date(m.kickoff).getTime() <= cutoff);
  }
  if (tab === "today") {
    const today = new Date(now).toDateString();
    return matches.filter((m) => new Date(m.kickoff).toDateString() === today);
  }
  if (tab === "tomorrow") {
    const tomorrow = new Date(now + 24 * 3_600_000).toDateString();
    return matches.filter((m) => new Date(m.kickoff).toDateString() === tomorrow);
  }
  // "Upcoming" means what it says: a match already in play belongs to Live,
  // and showing it in both is how a six-row section ends up all live.
  if (tab === "upcoming") return matches.filter((m) => !m.isLive);
  return matches;
}

export function MatchList({
  tab = "football",
  matches: provided,
  emptyLabel = "No matches here right now. Check back shortly.",
  limit,
}: {
  tab?: string;
  /** Pass a feed to render from it; omit and the list reads the shared poll. */
  matches?: FeedMatch[] | null;
  emptyLabel?: string;
  /** Cap the rows shown. The home page wants a taste, not the whole board. */
  limit?: number;
}) {
  const owned = provided === undefined;
  const feed = useFeed(owned);
  const [market, setMarket] = useState("1x2");
  const now = useNow();

  const matches = owned ? feed.matches : provided;

  const filtered = useMemo(
    () => (matches ? filterMatches(matches, tab, now) : null),
    [matches, tab, now],
  );

  const grouped = useMemo(() => {
    if (!filtered) return [];

    // The house's own matches come first, then whatever the feed brought, and
    // only then is the list cut to size, so a limit never costs a custom game
    // its place.
    const ordered = [
      ...filtered.filter((m) => m.source === "custom"),
      ...filtered.filter((m) => m.source !== "custom"),
    ];
    const shown = limit ? ordered.slice(0, limit) : ordered;

    const map = new Map<string, FeedMatch[]>();
    for (const m of shown) {
      const list = map.get(m.league) ?? [];
      list.push(m);
      map.set(m.league, list);
    }
    return [...map.entries()];
  }, [filtered, limit]);

  const activeTab = MARKET_TABS.find((t) => t.key === market) ?? MARKET_TABS[0];

  if (owned && feed.error && !matches) {
    return <div className="p-8 text-center text-[var(--text-muted)]">{feed.error}</div>;
  }

  if (!filtered) return <BoardSkeleton />;

  if (!filtered.length) {
    return (
      <div className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-8 text-center text-[13px] text-[var(--text-muted)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div>
      <div className="scroll-x mb-2 flex border-b border-[var(--line)]">
        {MARKET_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMarket(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[12px] font-bold transition-colors md:text-[13px] ${
              market === t.key
                ? "border-[var(--accent)] text-[var(--text-bright)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {grouped.map(([league, list]) => (
          <section
            key={league}
            className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]"
          >
            <header className="flex items-center gap-2 bg-[var(--surface)] px-3 py-1.5 md:px-4">
              <h2 className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {list[0].country ? `${list[0].country} · ` : ""}
                {league}
              </h2>
              <div className="flex shrink-0 gap-1 md:gap-1.5">
                {activeTab.cols.map((c) => (
                  <span
                    key={c}
                    className={`${ODDS_W} text-center text-[10px] font-bold text-[var(--text-faint)] md:text-[11px]`}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </header>

            <div className="divide-y divide-[var(--line)]">
              {list.map((m) => (
                <MatchRow key={m.id} match={m} marketKey={activeTab.key} cols={activeTab.cols} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function MatchRow({
  match,
  marketKey,
  cols,
}: {
  match: FeedMatch;
  marketKey: string;
  cols: string[];
}) {
  const toggle = useSlip((s) => s.toggle);
  const legs = useSlip((s) => s.legs);

  const market = match.markets.find((m) => m.key === marketKey);
  const selected = legs.find((l) => l.matchId === match.id);

  const pick = (outcome: string, odds: number, label: string) => {
    const leg: SlipLeg = {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      kickoff: match.kickoff,
      market: marketKey,
      marketLabel: market?.label ?? marketKey,
      outcome,
      outcomeLabel: label,
      odds,
    };
    toggle(leg);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--surface-3)] md:gap-3 md:px-4">
      <div className="w-11 shrink-0 md:w-14">
        {match.isLive ? (
          <span className="block text-[11px] font-black leading-tight text-[var(--live)]">
            <span className="live-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--live)] align-middle" />
            {match.minuteLabel}
          </span>
        ) : (
          <KickoffTime iso={match.kickoff} />
        )}
      </div>

      <Link href={`/match/${match.id}`} className="min-w-0 flex-1">
        <TeamLine name={match.homeTeam} crest={match.homeCrest} score={match.scoreHome} />
        <TeamLine name={match.awayTeam} crest={match.awayCrest} score={match.scoreAway} />
        <div className="mt-0.5 flex items-center gap-2">
          {match.bestOdds && (
            <span className="inline-flex items-center gap-0.5 rounded-sm bg-[var(--accent)] px-1 text-[9px] font-black uppercase leading-[15px] text-[var(--accent-ink)]">
              <Zap size={9} strokeWidth={2.6} />
              Boosted
            </span>
          )}
          {match.postponed && (
            <span className="text-[10px] font-semibold text-[var(--pending)]">Postponed</span>
          )}
          <span className="ml-auto inline-flex items-center text-[10px] font-semibold text-[var(--text-faint)]">
            +{match.markets.length}
            <ChevronRight size={11} strokeWidth={2} />
          </span>
        </div>
      </Link>

      <div className="flex shrink-0 gap-1 md:gap-1.5">
        {cols.map((outcome) => {
          const price = market?.prices.find((p) => p.outcome === outcome);
          const isOn = selected?.market === marketKey && selected?.outcome === outcome;
          const disabled = match.isLocked || !price;

          return (
            <button
              key={outcome}
              disabled={disabled}
              onClick={() => price && pick(outcome, price.odds, price.label)}
              className={`${ODDS_W} h-[38px] rounded-[5px] text-[13px] font-bold tabular-nums transition-colors disabled:opacity-35 md:h-[40px] md:text-[14px]`}
              style={
                isOn
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : { background: "var(--odds-btn)", color: "var(--text-bright)" }
              }
              aria-pressed={isOn}
              aria-label={`${match.homeTeam} v ${match.awayTeam}, ${outcome}, ${price?.odds ?? "unavailable"}`}
            >
              {disabled && !price ? (
                "-"
              ) : match.isLocked ? (
                <Lock size={13} strokeWidth={2} className="mx-auto" />
              ) : (
                price!.odds.toFixed(2)
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Kickoff in the viewer's own timezone.
 *
 * Safe to format during render: the board only ever has fixtures after the
 * client-side fetch resolves, so this never runs during the server pass and
 * cannot produce a hydration mismatch.
 */
function KickoffTime({ iso }: { iso: string }) {
  const now = useNow();
  const d = new Date(iso);
  // Read off the subscribed clock so a match does not keep saying "today"
  // after midnight has passed on an open tab.
  const today = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });

  return (
    <time
      dateTime={iso}
      className="block text-[12px] font-semibold leading-tight tabular-nums text-[var(--text)]"
    >
      {time}
      <span className="block text-[10px] font-medium text-[var(--text-faint)]">
        {today ? "Today" : date}
      </span>
    </time>
  );
}

function TeamLine({
  name,
  crest,
  score,
}: {
  name: string;
  crest: string | null;
  score: number | null;
}) {
  return (
    <div className="flex items-center gap-1.5 py-px">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4 shrink-0 object-contain"
        unoptimized
      />
      <span className="truncate text-[13px] font-semibold text-[var(--text-bright)]">{name}</span>
      {score != null && (
        <span className="ml-auto pl-2 text-[13px] font-black tabular-nums text-[var(--live)]">
          {score}
        </span>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((s) => (
        <div key={s} className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
          <div className="h-7 bg-[var(--surface)]" />
          {[0, 1, 2, 3].map((r) => (
            <div key={r} className="flex items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 md:px-4">
              <div className="h-8 flex-1 rounded bg-[var(--surface)] opacity-60" />
              {[0, 1, 2].map((b) => (
                <div key={b} className={`${ODDS_W} h-[38px] rounded-[5px] bg-[var(--odds-btn)] opacity-60`} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
