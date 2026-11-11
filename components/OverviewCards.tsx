import {
  BadgeCheck,
  Calendar,
  Clock,
  Coins,
  Download,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { OverviewStats } from "@/lib/overview";

function figure(totals: Record<string, number>): string {
  const entries = Object.entries(totals);
  if (!entries.length) return "GHS 0.00";
  const ordered = [...entries].sort((a, b) => (a[0] === "GHS" ? -1 : b[0] === "GHS" ? 1 : 0));
  return ordered
    .map(
      ([currency, amount]) =>
        `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    )
    .join("\n");
}

function Card({
  label,
  value,
  detail,
  Icon,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  detail: string;
  Icon: LucideIcon;
  valueClass?: string;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-[#121a33] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/55">{label}</p>
        <Icon size={16} strokeWidth={1.8} className="shrink-0 text-white/35" />
      </div>
      <p className={`mt-3 whitespace-pre-line text-[22px] font-black leading-tight tabular-nums ${valueClass}`}>
        {value}
      </p>
      <p className="mt-1 text-[12px] text-white/45">{detail}</p>
    </article>
  );
}

/** The same overview grid on the operator console and the sub-admin dashboard. */
export function OverviewCards({ stats, rate }: { stats: OverviewStats; rate?: number }) {
  // A partner sees their own share; the operator console sees no single rate.
  const label =
    rate === undefined
      ? "Pending commission"
      : `Pending commission (${Math.round(rate * 10000) / 100}%)`;
  return (
    <section className="grid grid-cols-2 gap-2.5">
      <Card
        label="My users"
        value={stats.users.toLocaleString()}
        detail="Registered players"
        Icon={Users}
      />
      <Card
        label="Their deposits"
        value={figure(stats.depositTotal)}
        detail={`${stats.depositCount.toLocaleString()} deposits`}
        Icon={Download}
      />
      <Card
        label="Deposits today"
        value={figure(stats.depositsToday)}
        detail={`${stats.depositsTodayCount.toLocaleString()} deposits`}
        Icon={Calendar}
      />
      <Card
        label={label}
        value={figure(stats.pendingCommission)}
        detail="Not yet paid out"
        Icon={Clock}
        valueClass="text-[#5b8def]"
      />
      <Card
        label="Settled commission"
        value={figure(stats.settledCommission)}
        detail={`${stats.commissionCount.toLocaleString()} credited deposits`}
        Icon={BadgeCheck}
        valueClass="text-[#3dde7a]"
      />
      <Card
        label="Staked today"
        value={figure(stats.stakedToday)}
        detail={`${stats.stakedTodayCount.toLocaleString()} bets`}
        Icon={Coins}
      />
      <Card
        label="My matches"
        value={stats.matches.toLocaleString()}
        detail={`${stats.liveMatches.toLocaleString()} live now`}
        Icon={Trophy}
      />
    </section>
  );
}
