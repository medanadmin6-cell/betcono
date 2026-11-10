import type { SupabaseClient } from "@supabase/supabase-js";
import { adapterFor, settledAmount } from "./gateways";
import { applyDepositCredit } from "./money";
import { GATEWAYS, type Gateway } from "./countries";

/**
 * Ask the gateway about deposits still marked pending, credit the ones that
 * were actually paid and close the ones the gateway says failed.
 *
 * A deposit used to be re-checked only when the player opened their account
 * screen, so a player who paid and never came back was never credited, and
 * their partner never saw the deposit or the commission. Credits are
 * idempotent (applyDepositCredit claims the row), so this is safe to run from
 * several places at once.
 */
export async function reconcilePendingDeposits(
  supabase: SupabaseClient,
  opts: { userIds?: string[]; sinceHours?: number; max?: number } = {},
): Promise<{ checked: number; credited: number; failed: number }> {
  const since = new Date(Date.now() - (opts.sinceHours ?? 72) * 3_600_000).toISOString();
  const max = opts.max ?? 25;

  type Row = {
    reference: string;
    user_id: string;
    amount: number;
    currency: string;
    provider: string;
    metadata: Record<string, unknown> | null;
  };
  const rows: Row[] = [];
  const load = (ids?: string[]) => {
    let q = supabase
      .from("payments")
      .select("reference, user_id, amount, currency, provider, metadata")
      .eq("status", "pending")
      .eq("metadata->>type", "deposit")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(max);
    if (ids) q = q.in("user_id", ids);
    return q;
  };

  if (opts.userIds) {
    // Chunked so a long id list stays under the request URL limit.
    for (let i = 0; i < opts.userIds.length && rows.length < max; i += 150) {
      const { data } = await load(opts.userIds.slice(i, i + 150));
      rows.push(...((data ?? []) as Row[]));
    }
  } else {
    const { data } = await load();
    rows.push(...((data ?? []) as Row[]));
  }

  let credited = 0;
  let failed = 0;
  const batch = rows.slice(0, max);

  // A few at a time, so a long backlog does not hold the page for long.
  for (let i = 0; i < batch.length; i += 5) {
    await Promise.all(
      batch.slice(i, i + 5).map(async (payment) => {
        if (!(GATEWAYS as string[]).includes(payment.provider)) return;
        const adapter = adapterFor(payment.provider as Gateway);
        if (!adapter) return;
        try {
          const meta = (payment.metadata ?? {}) as Record<string, unknown>;
          const outcome = await adapter.status(payment.reference, meta);
          if (outcome.status === "confirmed") {
            const result = await applyDepositCredit({
              userId: payment.user_id,
              amount: settledAmount(outcome, Number(payment.amount), payment.currency),
              currency: payment.currency,
              reference: payment.reference,
              provider: payment.provider,
            });
            if (result.credited) credited++;
          } else if (outcome.status === "failed") {
            const { data } = await supabase
              .from("payments")
              .update({ status: "failed", resolved_at: new Date().toISOString() })
              .eq("reference", payment.reference)
              .eq("status", "pending")
              .select("reference")
              .maybeSingle();
            if (data) failed++;
          }
        } catch (err) {
          console.error("[reconcile] check failed", payment.reference, err);
        }
      }),
    );
  }

  if (credited || failed) console.info("[reconcile] swept", { checked: batch.length, credited, failed });
  return { checked: batch.length, credited, failed };
}
