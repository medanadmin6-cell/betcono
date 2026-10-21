import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/** Platform totals for the overview page, broken out by currency. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  // Ghana runs on UTC, so midnight UTC is the start of the operator's day.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const yStart = new Date(dayStart);
  yStart.setUTCDate(yStart.getUTCDate() - 1);
  const dayStartIso = dayStart.toISOString();
  const yStartIso = yStart.toISOString();

  // A day's deposits are counted by when they were CREDITED (resolved_at), not
  // when the player started them — because the commission on a deposit is
  // earned at credit time too. Counting deposits by created_at and commission
  // by credit time put the two on different clocks, so a deposit started one
  // day and credited the next skewed the admin (house) share. Both sides now
  // read from the moment the money actually landed.
  const [
    { data: payments },
    { count: players },
    { count: depositors },
    { data: openBets },
    { count: pendingDeposits },
    { data: depositRowsToday },
    { data: commissionRowsToday },
    { data: depositRowsYesterday },
    { data: commissionRowsYesterday },
  ] = await Promise.all([
    supabase.from("payments").select("amount, currency, status, metadata").limit(5000),
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }).gt("total_deposited", 0),
    supabase.from("bets").select("stake, potential_win, currency").eq("status", "pending").limit(2000),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("provider", "manual"),
    supabase
      .from("payments")
      .select("amount, currency, status, metadata")
      .gte("resolved_at", dayStartIso)
      .limit(5000),
    supabase.from("commissions").select("amount, currency").gte("created_at", dayStartIso).limit(5000),
    supabase
      .from("payments")
      .select("amount, currency, status, metadata")
      .gte("resolved_at", yStartIso)
      .lt("resolved_at", dayStartIso)
      .limit(5000),
    supabase
      .from("commissions")
      .select("amount, currency")
      .gte("created_at", yStartIso)
      .lt("created_at", dayStartIso)
      .limit(5000),
  ]);

  type Row = { amount: number; currency: string; status?: string; metadata?: { type?: string } | null };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Sum credited (confirmed/resolved) deposits by currency, excluding withdrawals.
  function sumDeposits(rows: Row[] | null): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of rows ?? []) {
      const settled = p.status === "confirmed" || p.status === "resolved";
      if (!settled || (p.metadata ?? {}).type === "withdrawal") continue;
      out[p.currency] = round2((out[p.currency] ?? 0) + Number(p.amount));
    }
    return out;
  }

  function sumAmounts(rows: { amount: number; currency: string }[] | null): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of rows ?? []) out[c.currency] = round2((out[c.currency] ?? 0) + Number(c.amount));
    return out;
  }

  // The house's share: deposits credited in the window, less the commission
  // earned on them in the same window.
  function houseShare(dep: Record<string, number>, comm: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const currency of new Set([...Object.keys(dep), ...Object.keys(comm)])) {
      out[currency] = round2((dep[currency] ?? 0) - (comm[currency] ?? 0));
    }
    return out;
  }

  const deposits: Record<string, number> = {};
  const withdrawals: Record<string, number> = {};
  for (const p of payments ?? []) {
    const meta = (p.metadata ?? {}) as { type?: string };
    const settled = p.status === "confirmed" || p.status === "resolved";
    if (!settled) continue;
    const bucket = meta.type === "withdrawal" ? withdrawals : deposits;
    bucket[p.currency] = round2((bucket[p.currency] ?? 0) + Number(p.amount));
  }

  const depositsToday = sumDeposits(depositRowsToday as Row[] | null);
  const commissionToday = sumAmounts(commissionRowsToday);
  const adminToday = houseShare(depositsToday, commissionToday);

  const depositsYesterday = sumDeposits(depositRowsYesterday as Row[] | null);
  const commissionYesterday = sumAmounts(commissionRowsYesterday);
  const adminYesterday = houseShare(depositsYesterday, commissionYesterday);

  const liability: Record<string, number> = {};
  let openStake = 0;
  for (const b of openBets ?? []) {
    liability[b.currency] = Math.round(((liability[b.currency] ?? 0) + Number(b.potential_win)) * 100) / 100;
    openStake += Number(b.stake);
  }

  return NextResponse.json({
    deposits,
    withdrawals,
    depositsToday,
    commissionToday,
    adminToday,
    depositsYesterday,
    commissionYesterday,
    adminYesterday,
    players: players ?? 0,
    depositors: depositors ?? 0,
    openTickets: openBets?.length ?? 0,
    openStake: Math.round(openStake * 100) / 100,
    liability,
    pendingDeposits: pendingDeposits ?? 0,
  });
}
