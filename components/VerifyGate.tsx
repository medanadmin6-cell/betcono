"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatMoney } from "@/lib/countries";

/**
 * The verification prompt a player meets when they try to withdraw before the
 * deposit gate is met.
 *
 * It states the rule the endpoint actually enforces — `checkWithdrawalGate` is
 * the single source of it — and shows real progress against it. A deposit the
 * player already made to stake counts, so one done of three leaves two more.
 * The line about where the money goes is not decoration: a deposit lands in
 * the player's own betting wallet and is theirs to bet with.
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
  const done = Math.min(Math.max(0, have), Math.max(0, need));
  const remaining = Math.max(0, need - done);
  const money = formatMoney(amount, currency);
  const steps = Array.from({ length: need }, (_, index) => index);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Verification required"
    >
      <div className="absolute inset-0 bg-black/85" />

      <div className="relative max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-5">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
            Withdrawal deposits {done}/{need}
          </p>
        </div>

        <p
          role="status"
          className="mt-3 rounded-md border border-blue-200/20 bg-blue-400/10 px-3 py-3 text-[14px] leading-relaxed text-[var(--text-bright)]"
        >
          Withdrawal is available after you complete at least{" "}
          <span className="font-black tabular-nums">{need}</span> deposits. You
          have currently completed (
          <span className="font-black tabular-nums">{done}</span>) deposit
          {done === 1 ? "" : "s"}, so{" "}
          <span className="font-black tabular-nums">{remaining}</span> more
          deposit{remaining === 1 ? "" : "s"} are required before you can
          withdraw. Each deposit must be at least{" "}
          <span className="font-black tabular-nums">{money}</span>.
        </p>

        <div className="mt-4 space-y-2">
          {steps.map((index) => {
            const finished = index < done;
            const current = index === done;
            return (
              <div
                key={index}
                className={`rounded-md border px-3 py-2.5 ${
                  finished
                    ? "border-[#0a6b40]/25 bg-[#0a6b40]/10"
                    : "border-[var(--line)] bg-[var(--bg)]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-bold text-[var(--text-bright)]">
                    Deposit {index + 1}/{need}
                  </p>
                  <p
                    className={`text-[11px] font-black uppercase tracking-wide ${
                      finished ? "text-[#0a6b40]" : "text-[var(--text-faint)]"
                    }`}
                  >
                    {finished ? "Done" : "Required"}
                  </p>
                </div>
                {current && (
                  <Link
                    href="/deposit"
                    className="mt-2.5 block rounded-[5px] bg-[var(--accent)] py-2.5 text-center text-[13px] font-black text-[var(--accent-ink)]"
                  >
                    Deposit {money} (Deposit {index + 1}/{need})
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onRecheck}
          disabled={checking}
          className="mt-3 w-full rounded-[5px] border border-[var(--line)] py-2.5 text-center text-[13px] font-bold text-[var(--text)] disabled:opacity-50"
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
