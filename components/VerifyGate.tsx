"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatMoney } from "@/lib/countries";

/** Which verification this deposit pays for, in words rather than a score. */
const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth"];

/**
 * The verification prompt a player meets when they try to withdraw before the
 * deposit gate is met.
 *
 * It states the rule the endpoint actually enforces — `checkWithdrawalGate` is
 * the single source of it — and shows real progress against it. The line about
 * where the money goes is not decoration: a deposit lands in the player's own
 * betting wallet and is theirs to bet with, and a screen that asks for money
 * has to say what that money becomes.
 *
 * The arrow matters as much: without it the card is a wall, and a player who
 * opened the withdraw page to look around has no way back out.
 */
export function VerifyGate({
  amount,
  currency,
  have,
  need,
  onBack,
  onRecheck,
  checking = false,
}: {
  /** The qualifying deposit size, from the country config. */
  amount: number;
  currency: string;
  have: number;
  need: number;
  onBack: () => void;
  onRecheck: () => void;
  checking?: boolean;
}) {
  const done = Math.min(have, need);
  const pct = need > 0 ? Math.min(100, Math.round((done / need) * 100)) : 0;
  const which = ORDINALS[done] ?? "Next";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Verification required"
    >
      <div className="absolute inset-0 bg-black/85" />

      <div className="relative w-full max-w-sm rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-5">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            aria-label="Back"
            className="-ml-1 flex h-8 w-8 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
            {which} verification
          </p>
        </div>

        <p className="mt-3 text-[16px] leading-relaxed text-[var(--text-bright)]">
          Complete your verification with a{" "}
          <span className="font-black tabular-nums">{formatMoney(amount, currency)}</span> deposit to
          unlock withdrawals on your BetZone account.
        </p>

        <div className="mt-4 h-1.5 w-full overflow-hidden bg-[var(--surface-2)]">
          <div
            className="h-full bg-[var(--accent)] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <Link
          href="/deposit"
          className="mt-5 block rounded-[5px] bg-[var(--accent)] py-3 text-center text-[14px] font-black text-[var(--accent-ink)]"
        >
          Deposit {formatMoney(amount, currency)} to verify
        </Link>

        <button
          onClick={onRecheck}
          disabled={checking}
          className="mt-2 w-full rounded-[5px] border border-[var(--line)] py-2.5 text-center text-[13px] font-bold text-[var(--text)] disabled:opacity-50"
        >
          {checking ? "Checking…" : "I've completed a deposit"}
        </button>

        <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-faint)]">
          Deposits go to your own betting wallet. The money stays yours to bet with. It is not a
          fee, and nothing is taken from your balance to release a withdrawal.
        </p>
      </div>
    </div>
  );
}
