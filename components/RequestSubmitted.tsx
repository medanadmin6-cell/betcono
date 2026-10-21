"use client";

import Link from "next/link";

/**
 * The receipt a player gets the moment a withdrawal is accepted.
 *
 * It replaces a line of green text under the form, which was easy to submit
 * and then miss entirely. A withdrawal is the most consequential thing a
 * player does here, so it gets a dialog and two ways onward: the records, or
 * out. There is no dismiss — either button leaves the page, which is the point.
 */
export function RequestSubmitted({ title, message }: { title: string; message: string }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/70" />

      <div className="relative w-full max-w-[320px] overflow-hidden rounded-2xl bg-[var(--bg-elevated)] text-center">
        <div className="px-5 pb-5 pt-6">
          <h2 className="text-[17px] font-black text-[var(--text-bright)]">{title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">{message}</p>
        </div>

        <div className="grid grid-cols-2 border-t border-[var(--line)]">
          <Link
            href="/transactions"
            className="border-r border-[var(--line)] py-3.5 text-[15px] font-bold text-[var(--accent)]"
          >
            Transactions
          </Link>
          <Link href="/" className="py-3.5 text-[15px] font-bold text-[var(--accent)]">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
