"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, PlayCircle, LineChart, Star, ChevronDown, ChevronRight, Lock,
} from "lucide-react";
import { Page } from "@/components/Shell";
import { useSlip, type SlipLeg } from "@/lib/store";
import type { FeedMatch } from "@/lib/fixtures";
import type { Market, MarketGroup } from "@/lib/odds";
import { MARKET_FILTERS } from "@/lib/markets";

const POLL_MS = 30_000;

export function MatchDetail({ id }: { id: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<FeedMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MarketGroup | "all">("all");
  // Eighty markets cannot all be open at once. The first few are expanded and
  // the rest start collapsed; an explicit toggle always wins over that default.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const OPEN_BY_DEFAULT = 3;
  const [starred, setStarred] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/match/${encodeURIComponent(id)}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(json.error ?? "Could not load this match");
          return;
        }
        setMatch(json.match);
        setError(null);
      } catch {
        if (alive) setError("Could not load this match");
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id]);

  const all = match?.markets ?? [];
  const markets = all.filter((m) => filter === "all" || m.group === filter);

  // A tab with nothing behind it is worse than no tab, so the row only shows
  // groups this fixture actually prices.
  const present = new Set(all.map((m) => m.group));
  const visibleFilters = MARKET_FILTERS.filter((f) => f.key === "all" || present.has(f.key));

  return (
    <Page rails>
      <div className="-mt-1 mb-1 flex items-center gap-2">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="-ml-1 rounded p-1 text-[var(--text-bright)] hover:bg-[var(--surface)]"
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
        {match && (
          <nav className="min-w-0 truncate text-[12px] text-[var(--text-muted)]">
            <Link href="/" className="hover:underline">
              Football
            </Link>
            {" / "}
            <Link href={`/search?q=${encodeURIComponent(match.league)}`} className="hover:underline">
              {match.country ? `${match.country} · ` : ""}
              {match.league}
            </Link>
          </nav>
        )}
      </div>

      <div>
        {error ? (
          <div className="p-10 text-center">
            <p className="text-[14px] text-[var(--text-muted)]">{error}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[13px] font-medium text-[var(--accent-ink)]"
            >
              Back to the board
            </Link>
          </div>
        ) : !match ? (
          <DetailSkeleton />
        ) : (
          <>
            <div className="overflow-hidden rounded-md bg-[var(--chrome)] text-white">
              {match.bestOdds && (
                <div className="px-4 pt-3">
                  <span className="inline-flex items-center gap-1 rounded-sm bg-[#9ff611] px-1.5 text-[10px] font-black uppercase leading-[18px] text-[#071a33]">
                    <Zap size={11} strokeWidth={2.6} />
                    Boosted odds
                  </span>
                </div>
              )}
              <MatchHead match={match} />
            </div>

            <div className="mt-2 flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2.5 md:px-4">
              <span className="flex items-center gap-2 text-[12px] text-[var(--text)]">
                <PlayCircle size={16} strokeWidth={1.8} className="text-[var(--accent)]" />
                {match.isLive
                  ? "In-play — betting is closed"
                  : match.postponed
                    ? "Postponed"
                    : "Live In-Play Available"}
              </span>
              <Link
                href={`/match/${id}/tracker`}
                className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]"
              >
                <LineChart size={15} strokeWidth={2} />
                Tracker
              </Link>
            </div>

            <div className="scroll-x mt-3 flex border-b border-[var(--line)]">
              {visibleFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-bold ${
                    filter === f.key
                      ? "border-[var(--accent)] text-[var(--text-bright)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <p className="py-2 text-[11px] text-[var(--text-faint)]">
              {all.length} market{all.length === 1 ? "" : "s"}
            </p>

            <div className="space-y-2">
              {markets.map((m, i) => (
                <MarketCard
                  key={m.key}
                  match={match}
                  market={m}
                  collapsed={collapsed[m.key] ?? i >= OPEN_BY_DEFAULT}
                  starred={Boolean(starred[m.key])}
                  onToggle={() =>
                    setCollapsed((c) => ({ ...c, [m.key]: !(c[m.key] ?? i >= OPEN_BY_DEFAULT) }))
                  }
                  onStar={() => setStarred((s) => ({ ...s, [m.key]: !s[m.key] }))}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Page>
  );
}

/** The scoreboard, on the navy chrome in both themes. */
function MatchHead({ match }: { match: FeedMatch }) {
  const d = new Date(match.kickoff);

  return (
    <div className="flex items-start justify-between gap-2 px-4 py-5 md:px-10 md:py-7">
      <TeamSide name={match.homeTeam} crest={match.homeCrest} />

      <div className="flex shrink-0 flex-col items-center pt-2">
        {match.isLive ? (
          <>
            <span className="text-[26px] font-black tabular-nums text-white md:text-[32px]">
              {match.scoreHome ?? 0} : {match.scoreAway ?? 0}
            </span>
            <span className="mt-1 flex items-center gap-1 text-[12px] font-black text-[#ff5a52]">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#ff5a52]" />
              {match.minuteLabel}
            </span>
          </>
        ) : (
          <>
            <span className="text-[12px] font-semibold text-white/65">
              {d.toLocaleDateString([], { day: "numeric", month: "short", weekday: "long" })}
            </span>
            <span className="mt-1 text-[24px] font-black tabular-nums text-white md:text-[28px]">
              {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          </>
        )}
      </div>

      <TeamSide name={match.awayTeam} crest={match.awayCrest} />
    </div>
  );
}

function TeamSide({ name, crest }: { name: string; crest: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={56}
        height={56}
        className="h-12 w-12 object-contain md:h-14 md:w-14"
        unoptimized
      />
      <span className="text-center text-[13px] font-bold leading-tight text-white md:text-[14px]">
        {name}
      </span>
    </div>
  );
}

function MarketCard({
  match,
  market,
  collapsed,
  starred,
  onToggle,
  onStar,
}: {
  match: FeedMatch;
  market: Market;
  collapsed: boolean;
  starred: boolean;
  onToggle: () => void;
  onStar: () => void;
}) {
  const toggle = useSlip((s) => s.toggle);
  const legs = useSlip((s) => s.legs);
  const selected = legs.find((l) => l.matchId === match.id);

  const pick = (outcome: string, odds: number, label: string) => {
    const leg: SlipLeg = {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      kickoff: match.kickoff,
      market: market.key,
      marketLabel: market.label,
      outcome,
      outcomeLabel: label,
      odds,
    };
    toggle(leg);
  };

  return (
    <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
      <header className="flex items-center gap-2 px-3 py-2.5 md:px-4">
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {collapsed ? (
            <ChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-[var(--text-muted)]" />
          ) : (
            <ChevronDown size={16} strokeWidth={2.4} className="shrink-0 text-[var(--text-muted)]" />
          )}
          <h2 className="truncate text-[13px] font-bold text-[var(--text-bright)]">{market.label}</h2>
          {market.badge && (
            <span className="rounded-sm px-1 text-[10px] font-black leading-[16px] text-[var(--accent)] ring-1 ring-[var(--accent)]">
              {market.badge}
            </span>
          )}
        </button>

        <button
          onClick={onStar}
          aria-label={starred ? "Unstar market" : "Star market"}
          className="ml-auto"
          style={{ color: starred ? "var(--accent)" : "var(--text-faint)" }}
        >
          <Star size={15} strokeWidth={2} fill={starred ? "currentColor" : "none"} />
        </button>
      </header>

      {!collapsed && (
        <div
          className="grid gap-1.5 px-2.5 pb-2.5 md:gap-2 md:px-4 md:pb-4"
          style={{
            // Correct-score style markets carry dozens of outcomes, so they lay
            // out as a dense grid of small tiles rather than full-width rows.
            gridTemplateColumns: market.dense
              ? "repeat(auto-fill, minmax(84px, 1fr))"
              : `repeat(${market.prices.length === 2 ? 2 : 3}, minmax(0,1fr))`,
          }}
        >
          {market.prices.map((p) => {
            const isOn = selected?.market === market.key && selected?.outcome === p.outcome;
            const locked = match.isLocked;

            return (
              <button
                key={p.outcome}
                disabled={locked}
                onClick={() => pick(p.outcome, p.odds, p.label)}
                className={
                  market.dense
                    ? "flex h-[40px] items-center justify-between rounded-[5px] px-2 disabled:opacity-60"
                    : "flex h-[44px] items-center justify-between rounded-[5px] px-3 disabled:opacity-60 md:h-[48px] md:px-4"
                }
                style={{
                  background: isOn ? "var(--accent)" : "var(--odds-btn)",
                  color: isOn ? "var(--accent-ink)" : "var(--text-muted)",
                }}
                aria-pressed={isOn}
                aria-label={`${market.label}, ${p.label}, ${locked ? "locked" : p.odds}`}
              >
                <span className={market.dense ? "truncate text-[12px]" : "truncate text-[13px] md:text-[15px]"}>
                  {p.label}
                </span>
                {locked ? (
                  <Lock size={14} strokeWidth={2} />
                ) : (
                  <span
                    className={
                      market.dense
                        ? "text-[12px] font-black tabular-nums"
                        : "text-[14px] font-black tabular-nums md:text-[15px]"
                    }
                    style={{ color: isOn ? "var(--accent-ink)" : "var(--text-bright)" }}
                  >
                    {p.odds.toFixed(2)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-32 rounded-md bg-[var(--surface)]" />
      <div className="h-10 rounded-md bg-[var(--bg-elevated)]" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[92px] rounded-md bg-[var(--bg-elevated)]" />
      ))}
    </div>
  );
}
