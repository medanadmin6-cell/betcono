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
    <div className="flex items-center gap-3 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-1.5">
      <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
        Recent wins
      </span>
      <div className="relative flex flex-1 items-center overflow-hidden">
        {/* Two copies of the row so the -50% crawl loops without a seam. */}
        <div className="marquee flex items-center gap-7 whitespace-nowrap text-[12px] font-semibold">
          {[...items, ...items].map((w, i) => (
            <span key={`${w.id}-${i}`} className="flex items-center gap-2">
              <span className="tabular-nums text-[var(--text-muted)]">{w.number}</span>
              <span className="font-black tabular-nums text-[var(--accent)]">{w.amount}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
