import type { SupabaseClient } from "@supabase/supabase-js";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rebuild a partner's owed (balances) and lifetime totals from the
 * commissions table, which is the record of every commission ever paid.
 *
 * The totals used to be kept by read-add-write after each commission, so two
 * deposits landing together overwrote each other, and a total update that
 * timed out after the row was written was skipped on retry. Both lost money
 * from the partner's dashboard while the commission rows stayed correct.
 *
 * What the operator has already settled is lifetime - balance on the stored
 * row. Lost updates removed the same amount from both, so that difference is
 * still exact, and the corrected owed amount is (sum of rows) - settled.
 */
export async function syncPartnerTotals(supabase: SupabaseClient, partnerId: string): Promise<void> {
  const [{ data: partner }, rows] = await Promise.all([
    supabase.from("sub_admins").select("balances, lifetime").eq("id", partnerId).maybeSingle(),
    commissionSums(supabase, partnerId),
  ]);
  if (!partner || !rows) return;

  const balances = (partner.balances ?? {}) as Record<string, number>;
  const lifetime = (partner.lifetime ?? {}) as Record<string, number>;

  const nextLifetime: Record<string, number> = {};
  const nextBalances: Record<string, number> = {};
  let changed = false;
  for (const currency of new Set([...Object.keys(rows), ...Object.keys(lifetime), ...Object.keys(balances)])) {
    const settled = Math.max(0, Number(lifetime[currency] ?? 0) - Number(balances[currency] ?? 0));
    const earned = round2(rows[currency] ?? 0);
    nextLifetime[currency] = earned;
    nextBalances[currency] = round2(Math.max(0, earned - settled));
    if (
      nextLifetime[currency] !== round2(Number(lifetime[currency] ?? 0)) ||
      nextBalances[currency] !== round2(Number(balances[currency] ?? 0))
    ) {
      changed = true;
    }
  }
  if (!changed) return;

  const { error } = await supabase
    .from("sub_admins")
    .update({ balances: nextBalances, lifetime: nextLifetime })
    .eq("id", partnerId);
  if (error) {
    console.error("[partner] totals sync failed", partnerId, error);
    return;
  }
  console.info("[partner] totals corrected from commission rows", {
    partnerId,
    from: { balances, lifetime },
    to: { balances: nextBalances, lifetime: nextLifetime },
  });
}

/** Every partner at once, for the admin overview. */
export async function syncAllPartnerTotals(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.from("sub_admins").select("id");
  for (const row of data ?? []) await syncPartnerTotals(supabase, row.id);
}

/** Sum of commission paid per currency, or null if the table could not be read. */
async function commissionSums(
  supabase: SupabaseClient,
  partnerId: string,
): Promise<Record<string, number> | null> {
  const sums: Record<string, number> = {};
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase
      .from("commissions")
      .select("currency, amount")
      .eq("sub_admin_id", partnerId)
      .order("id")
      .range(from, from + 999);
    if (error) return null;
    for (const r of data ?? []) {
      const code = r.currency || "GHS";
      sums[code] = (sums[code] ?? 0) + Number(r.amount);
    }
    if (!data || data.length < 1000) break;
  }
  return sums;
}
