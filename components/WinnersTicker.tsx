"use client";

import { useEffect, useState } from "react";

/**
 * The winners ticker.
 *
 * This is a marketing prop, not a feed of real settled tickets: the numbers and
 * amounts are generated. It is labelled as such in the README's Known gaps, and
 * it deliberately does not read from the bets table.
 */

const PREFIXES = ["024", "054", "055", "059", "020", "026", "027"];
const CURRENCIES = ["GH₵", "₦", "KSh"];

function maskedNumber(seed: number): string {
  const prefix = PREFIXES[seed % PREFIXES.length];
  return `${prefix}****${String(100 + (seed % 900)).slice(0, 3)}`;
}

function generate(count: number) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const seed = Math.floor(now / 60_000) + i * 7919;
    const currency = CURRENCIES[seed % CURRENCIES.length];
    const amount = 50 + ((seed * 37) % 9500);
    return {
      id: `${seed}`,
      number: maskedNumber(seed),
      amount: `${currency}${amount.toLocaleString()}`,
    };
  });
}

export function WinnersTicker() {
  const [items, setItems] = useState(() => generate(8));

  useEffect(() => {
    const timer = setInterval(() => setItems(generate(8)), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2">
      <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--lose)]/30 bg-[var(--lose)]/20 px-2 py-0.5 text-[10px] font-black text-[var(--lose)]">
        <span className="live-dot h-2 w-2 rounded-full bg-[var(--lose)]" />
        LIVE TICKER
      </span>
      <div className="relative flex flex-1 items-center overflow-hidden">
        {/* Two copies of the row so the -50% crawl loops without a seam. */}
        <div className="marquee flex items-center gap-8 whitespace-nowrap text-[12px] font-semibold">
          {[...items, ...items].map((w, i) => (
            <span key={`${w.id}-${i}`} className="flex items-center gap-2.5">
              <span className="font-bold text-[var(--text)]">🎉 {w.number}</span>
              <span className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2.5 py-0.5 font-black tracking-tight text-[var(--accent)]">
                {w.amount} Won
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
