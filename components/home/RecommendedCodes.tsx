"use client";

import { useEffect, useState } from "react";
import { Share2, Sparkles } from "lucide-react";
import { useSlip, type SlipLeg } from "@/lib/store";

/**
 * The AI picks rail: ready-made accumulators behind real booking codes,
 * the way the reference lists its recommended football codes. Adding one
 * drops the whole slip in; sharing hands out the load-code link, so the
 * code works for someone who has never opened the app.
 */

interface Card {
  code: string;
  title: string;
  totalOdds: number;
  legs: SlipLeg[];
}

function day(kickoff: string): string {
  const d = new Date(kickoff);
  return `${d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function oddsLabel(total: number): string {
  if (total >= 1000) return `${Math.round(total / 100) / 10}k`;
  return total.toFixed(2);
}

export function RecommendedCodes() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useSlip((s) => s.load);

  useEffect(() => {
    let alive = true;
    fetch("/api/recommended")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setCards(j.items ?? []);
      })
      .catch(() => {
        if (alive) setCards([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!cards?.length) return null;

  const share = async (card: Card) => {
    const url = `${window.location.origin}/load-code?code=${card.code}`;
    const text = `BetCono code ${card.code} — ${card.legs.length} picks at ${oddsLabel(card.totalOdds)} odds. ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `BetCono code ${card.code}`, text, url });
        return;
      }
    } catch {
      /* fall through to the clipboard */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(card.code);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* no clipboard either — the code is on the card */
    }
  };

  return (
    <section className="mx-2.5 mt-3 md:mx-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={15} className="text-[var(--accent)]" />
        <h2 className="text-[14px] font-black uppercase tracking-tight text-[var(--text-bright)]">
          AI Football Codes
        </h2>
      </div>

      <div className="scroll-x flex gap-2.5 pb-1">
        {cards.map((card) => (
          <article
            key={card.code}
            className="w-[300px] shrink-0 overflow-hidden rounded-xl bg-[var(--bg-elevated)] ring-1 ring-[var(--line)] sm:w-[340px]"
          >
            <header className="flex items-center justify-between bg-[var(--surface)] px-3 py-2">
              <span className="text-[14px] font-black tracking-[0.08em] text-[var(--text-bright)]">
                {card.code}
              </span>
              <span className="text-[11px] font-bold text-[var(--text-muted)]">
                Folds: {card.legs.length}
              </span>
              <span className="text-[12px] font-black text-[var(--accent)]">
                Odds: {oddsLabel(card.totalOdds)}
              </span>
            </header>

            <ul className="px-3 py-2">
              {card.legs.slice(0, 4).map((leg) => (
                <li key={leg.matchId} className="border-b border-[var(--line)] py-1.5 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12px] font-bold">
                      {leg.outcomeLabel} <span className="text-[var(--accent)]">@{leg.odds.toFixed(2)}</span>
                      <span className="ml-1 font-medium text-[var(--text-faint)]">{leg.marketLabel}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--text-faint)]">{day(leg.kickoff)}</span>
                  </div>
                  <p className="truncate text-[11px] text-[var(--text-muted)]">
                    {leg.homeTeam} vs {leg.awayTeam}
                  </p>
                </li>
              ))}
              {card.legs.length > 4 && (
                <li className="pt-1.5 text-[11px] font-bold text-[var(--text-faint)]">
                  +{card.legs.length - 4} more picks
                </li>
              )}
            </ul>

            <footer className="flex">
              <button
                onClick={() => void share(card)}
                className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] font-bold text-[var(--text-muted)]"
              >
                <Share2 size={14} />
                {copied === card.code ? "Copied!" : "Share"}
              </button>
              <button
                onClick={() => load(card.legs)}
                className="flex-1 bg-[var(--accent)] py-2.5 text-[12px] font-black text-[var(--accent-ink)]"
              >
                Add to Betslip
              </button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
