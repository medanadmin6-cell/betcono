"use client";

import Link from "next/link";
import { ChevronRight, Users, Banknote, ArrowDownToLine, ReceiptText } from "lucide-react";
import { useAdminData, CurrencyTotals } from "@/components/admin/ui";

interface Overview {
  deposits: Record<string, number>;
  withdrawals: Record<string, number>;
  depositsToday: Record<string, number>;
  players: number;
  depositors: number;
  openTickets: number;
  pendingDeposits: number;
}

const LINKS = [
  { href: "/admin/players", label: "My Users", Icon: Users },
  { href: "/admin/deposits", label: "Deposits", Icon: Banknote },
  { href: "/admin/withdrawals", label: "Withdrawals", Icon: ArrowDownToLine },
  { href: "/admin/payments", label: "Transactions", Icon: ReceiptText },
];

export default function OverviewPage() {
  const { data, error, busy } = useAdminData<Overview>("/api/admin/overview");

  if (error) return <p className="text-[13px] text-[var(--lose)]">{error}</p>;
  if (busy && !data) return <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>;
  if (!data) return null;

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100vh-7.5rem)] bg-[#07111f] px-4 py-5 text-white">
      <div className="mx-auto max-w-lg space-y-3">
        <div>
          <h1 className="text-[22px] font-black">Overview</h1>
          <p className="mt-1 text-[13px] text-white/60">
            Live player and ledger totals.
          </p>
        </div>

        {data.pendingDeposits > 0 && (
          <Link
            href="/admin/deposits"
            className="flex items-center gap-1 rounded-2xl bg-[#f5a524]/15 px-4 py-3 text-[13px] font-semibold text-[#f5a524]"
          >
            {data.pendingDeposits} manual deposit{data.pendingDeposits === 1 ? "" : "s"} waiting
            <ChevronRight size={15} strokeWidth={2.2} className="ml-auto" />
          </Link>
        )}

        <div className="grid grid-cols-2 gap-2">
          {LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#0a6b40] px-3 py-3 text-[13px] font-black text-[#f4fff8]"
            >
              <item.Icon size={16} strokeWidth={2.2} />
              {item.label}
            </Link>
          ))}
        </div>

        <section className="grid grid-cols-2 gap-2">
          <article className="rounded-2xl border border-white/10 bg-[#0c1a30] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">My users</p>
            <p className="mt-1 text-[28px] font-black tabular-nums">{data.players.toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-white/50">
              {data.depositors.toLocaleString()} have deposited
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-[#0c1a30] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Their deposits</p>
            <div className="mt-2 text-[15px]">
              <CurrencyTotals totals={data.deposits} />
            </div>
            <p className="mt-1 text-[11px] text-white/50">Confirmed deposits</p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0c1a30] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Deposits today</p>
          <div className="mt-2">
            <CurrencyTotals totals={data.depositsToday} />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0c1a30] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Withdrawals</p>
          <div className="mt-2">
            <CurrencyTotals totals={data.withdrawals} />
          </div>
          <p className="mt-1 text-[11px] text-white/50">Paid and resolved withdrawals</p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0c1a30] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Open tickets</p>
          <p className="mt-1 text-[28px] font-black tabular-nums">{data.openTickets.toLocaleString()}</p>
        </section>
      </div>
    </div>
  );
}
