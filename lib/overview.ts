import type { SupabaseClient } from "@supabase/supabase-js";

/** Live totals for the overview cards. Amounts are split by currency. */
export interface OverviewStats {
  users: number;
  depositTotal: Record<string, number>;
  depositCount: number;
  depositsToday: Record<string, number>;
  depositsTodayCount: number;
  pendingCommission: Record<string, number>;
  settledCommission: Record<string, number>;
  commissionCount: number;
  stakedToday: Record<string, number>;
  stakedTodayCount: number;
  matches: number;
  liveMatches: number;
}

const EMPTY: OverviewStats = {
  users: 0,
  depositTotal: {},
  depositCount: 0,
  depositsToday: {},
  depositsTodayCount: 0,
  pendingCommission: {},
  settledCommission: {},
  commissionCount: 0,
  stakedToday: {},
  stakedTodayCount: 0,
  matches: 0,
  liveMatches: 0,
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function add(bucket: Record<string, number>, currency: string, amount: number) {
  const code = currency || "GHS";
  bucket[code] = round2((bucket[code] ?? 0) + Number(amount));
}

function isDeposit(row: { status?: string; metadata?: { type?: string } | null }) {
  const settled = row.status === "confirmed" || row.status === "resolved";
  return settled && (row.metadata ?? {}).type !== "withdrawal";
}

/** Read every matching page. Stops at an empty page or at 20,000 rows. */
async function pages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await load(from, from + 999);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function referredIds(supabase: SupabaseClient, partnerId: string): Promise<string[]> {
  const rows = await pages<{ id: string }>((from, to) =>
    supabase
      .from("users")
      .select("id")
      .eq("referred_by", partnerId)
      .order("id")
      .range(from, to),
  );
  return rows.map((row) => row.id);
}

/**
 * Overview for one partner, or for the whole book when partnerId is null.
 * A partner only sees players who registered with their referral code.
 */
export async function loadOverview(
  supabase: SupabaseClient,
  partnerId: string | null,
): Promise<OverviewStats> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();

  const userIds = partnerId ? await referredIds(supabase, partnerId) : null;

  const userCountQuery = supabase.from("users").select("id", { count: "exact", head: true });
  const commissionCountQuery = supabase.from("commissions").select("id", { count: "exact", head: true });
  const [{ count: users }, { count: commissionCount }, matches, partners] = await Promise.all([
    partnerId ? userCountQuery.eq("referred_by", partnerId) : userCountQuery,
    partnerId ? commissionCountQuery.eq("sub_admin_id", partnerId) : commissionCountQuery,
    supabase.from("custom_matches").select("is_live, finished").limit(2000),
    partnerId
      ? supabase.from("sub_admins").select("balances, lifetime").eq("id", partnerId)
      : supabase.from("sub_admins").select("balances, lifetime").limit(2000),
  ]);

  type Pay = {
    amount: number;
    currency: string;
    status: string;
    metadata: { type?: string } | null;
    resolved_at: string | null;
  };
  let payments: Pay[] = [];
  if (userIds === null) {
    payments = await pages<Pay>((from, to) =>
      supabase
        .from("payments")
        .select("amount, currency, status, metadata, resolved_at")
        .order("id")
        .range(from, to),
    );
  } else if (userIds.length) {
    for (let i = 0; i < userIds.length; i += 200) {
      const slice = userIds.slice(i, i + 200);
      const chunk = await pages<Pay>((from, to) =>
        supabase
          .from("payments")
          .select("amount, currency, status, metadata, resolved_at")
          .in("user_id", slice)
          .order("id")
          .range(from, to),
      );
      payments.push(...chunk);
    }
  }

  type Stake = { stake: number; currency: string };
  let stakes: Stake[] = [];
  if (userIds === null) {
    stakes = await pages<Stake>((from, to) =>
      supabase
        .from("bets")
        .select("stake, currency")
        .gte("created_at", dayStartIso)
        .order("id")
        .range(from, to),
    );
  } else if (userIds.length) {
    for (let i = 0; i < userIds.length; i += 200) {
      const slice = userIds.slice(i, i + 200);
      const chunk = await pages<Stake>((from, to) =>
        supabase
          .from("bets")
          .select("stake, currency")
          .gte("created_at", dayStartIso)
          .in("user_id", slice)
          .order("id")
          .range(from, to),
      );
      stakes.push(...chunk);
    }
  }

  const stats: OverviewStats = {
    ...EMPTY,
    users: users ?? userIds?.length ?? 0,
    commissionCount: commissionCount ?? 0,
    depositTotal: {},
    depositsToday: {},
    pendingCommission: {},
    settledCommission: {},
    stakedToday: {},
  };

  for (const payment of payments) {
    if (!isDeposit(payment)) continue;
    add(stats.depositTotal, payment.currency, payment.amount);
    stats.depositCount += 1;
    if (payment.resolved_at && payment.resolved_at >= dayStartIso) {
      add(stats.depositsToday, payment.currency, payment.amount);
      stats.depositsTodayCount += 1;
    }
  }

  for (const bet of stakes) {
    add(stats.stakedToday, bet.currency, bet.stake);
    stats.stakedTodayCount += 1;
  }

  const pending: Record<string, number> = {};
  const earned: Record<string, number> = {};
  for (const partner of partners.data ?? []) {
    const balances = (partner.balances ?? {}) as Record<string, number>;
    const lifetime = (partner.lifetime ?? {}) as Record<string, number>;
    for (const [currency, amount] of Object.entries(balances)) add(pending, currency, amount);
    for (const [currency, amount] of Object.entries(lifetime)) add(earned, currency, amount);
  }
  stats.pendingCommission = pending;
  const settled: Record<string, number> = {};
  for (const currency of new Set([...Object.keys(earned), ...Object.keys(pending)])) {
    settled[currency] = round2(Math.max(0, (earned[currency] ?? 0) - (pending[currency] ?? 0)));
  }
  stats.settledCommission = settled;

  const rows = matches.data ?? [];
  stats.matches = rows.length;
  stats.liveMatches = rows.filter((match) => match.is_live && !match.finished).length;

  return stats;
}
