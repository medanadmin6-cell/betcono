"use client";

import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useSlip, type SlipLeg } from "@/lib/store";
import type { FeedMatch } from "@/lib/fixtures";

/**
 * The featured match strip.
 *
 * A wider treatment than the board row: crests and names on either side, the
 * score or kickoff between them, and three outcome buttons with the label on
 * the left and the price on the right.
 */
export function FeaturedMatches({ matches }: { matches: FeedMatch[] }) {
  if (!matches.length) return null;

  return (
    <div className="scroll-x -mx-2.5 flex snap-x snap-mandatory gap-2 px-2.5 pb-1 md:mx-0 md:px-0">
      {matches.map((m) => (
        <FeaturedCard key={m.id} match={m} />
      ))}
    </div>
  );
}

function FeaturedCard({ match }: { match: FeedMatch }) {
  const toggle = useSlip((s) => s.toggle);
  const legs = useSlip((s) => s.legs);

  const market = match.markets.find((m) => m.key === "1x2");
  const selected = legs.find((l) => l.matchId === match.id);
  const kickoff = new Date(match.kickoff);

  const pick = (outcome: string, odds: number, label: string) => {
    const leg: SlipLeg = {
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      kickoff: match.kickoff,
      market: "1x2",
      marketLabel: market?.label ?? "Match result",
      outcome,
      outcomeLabel: label,
      odds,
    };
    toggle(leg);
  };

  return (
    <article className="w-[286px] shrink-0 snap-start rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-3 md:w-[320px]">
      <Link href={`/match/${match.id}`} className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--text-muted)]">
          {match.league}
        </p>
        {match.isLive ? (
          <span className="flex items-center gap-1 text-[11px] font-black text-[var(--live)]">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
            {match.minuteLabel}
          </span>
        ) : (
          <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
            {kickoff.toLocaleDateString([], { day: "2-digit", month: "short" })}{" "}
            {kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
        )}
      </Link>

      <Link href={`/match/${match.id}`} className="mt-2.5 flex items-center gap-2">
        <Side name={match.homeTeam} crest={match.homeCrest} />
        <span className="shrink-0 px-1 text-[18px] font-black tabular-nums text-[var(--text-bright)]">
          {match.isLive ? `${match.scoreHome ?? 0} : ${match.scoreAway ?? 0}` : "v"}
        </span>
        <Side name={match.awayTeam} crest={match.awayCrest} />
      </Link>

      <div className="mt-3 grid grid-cols-3 gap-1">
        {["1", "X", "2"].map((outcome) => {
          const price = market?.prices.find((p) => p.outcome === outcome);
          const isOn = selected?.market === "1x2" && selected?.outcome === outcome;
          const disabled = match.isLocked || !price;

          return (
            <button
              key={outcome}
              disabled={disabled}
              onClick={() => price && pick(outcome, price.odds, price.label)}
              className="flex h-9 items-center justify-between rounded-[5px] px-2.5 disabled:opacity-40"
              style={{
                background: isOn ? "var(--accent)" : "var(--odds-btn)",
                color: isOn ? "var(--accent-ink)" : "var(--text-muted)",
              }}
              aria-pressed={isOn}
              aria-label={`${match.homeTeam} v ${match.awayTeam}, ${outcome}, ${price?.odds ?? "unavailable"}`}
            >
              <span className="text-[11px] font-bold">{outcome}</span>
              <span
                className="text-[13px] font-black tabular-nums"
                style={{ color: isOn ? "var(--accent-ink)" : "var(--text-bright)" }}
              >
                {match.isLocked ? <Lock size={13} strokeWidth={2} /> : price ? price.odds.toFixed(2) : "-"}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function Side({ name, crest }: { name: string; crest: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 object-contain"
        unoptimized
      />
      <span className="line-clamp-1 text-center text-[12px] font-bold leading-tight text-[var(--text-bright)]">
        {name}
      </span>
    </span>
  );
}
