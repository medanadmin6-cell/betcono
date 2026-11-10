
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCountry, formatMoney } from "./countries";
import { subAdminIndex, isSubAdminAccount } from "./partner-accounts";

export type GateName = "details" | "deposits" | "approval";

export interface GateSubject {
  country_code: string;
  currency: string;
  balance: number | string;
  total_deposited: number | string;
  qualifying_deposits: number;
  withdrawal_approved: boolean;
  payout_number?: string | null;
  payout_bank?: string | null;
  isPartner?: boolean;
  /** True after the player has a settled winning ticket. Absent keeps the deposit check. */
  hasWonBet?: boolean;
  /**
   * The size each qualifying deposit must reach for this player. Set from the
   * referring partner's deposit adjustment; absent falls back to the country.
   */
  qualifyAmount?: number;
}

/**
 * What one qualifying deposit must be for this player. A partner who has
 * adjusted the minimum deposit for their players moves this figure with it,
 * so the withdrawal screen asks for the same amount the deposit screen does.
 */
export function qualifyAmountFrom(countryCode: string, partnerMinimum: unknown): number {
  const set = Number(partnerMinimum);
  if (Number.isFinite(set) && set > 0) return set;
  return getCountry(countryCode).withdrawQualifyAmount;
}

/** The referring partner's deposit adjustment, or null if none (or 0015 not applied). */
export async function partnerMinimum(
  supabase: SupabaseClient,
  referredBy: string | null | undefined,
): Promise<number | null> {
  if (!referredBy) return null;
  const { data, error } = await supabase
    .from("sub_admins")
    .select("min_deposit")
    .eq("id", referredBy)
    .maybeSingle();
  if (error) return null;
  const set = Number(data?.min_deposit);
  return Number.isFinite(set) && set > 0 ? set : null;
}

/** Every partner's deposit adjustment, keyed by partner id. */
export async function partnerMinimums(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("sub_admins").select("id, min_deposit");
  const map = new Map<string, number>();
  if (error) return map;
  for (const row of data ?? []) {
    const set = Number(row.min_deposit);
    if (Number.isFinite(set) && set > 0) map.set(String(row.id), set);
  }
  return map;
}

export interface GateResult {
  ok: boolean;
  failed?: GateName;
  message?: string;
  progress: {
    have: number;
    need: number;
    label: string;
  };
}

export interface PayoutDetails {
  number?: string;
  bank?: string;
}

export function checkWithdrawalGate(
  user: GateSubject,
  amount: number,
  details: PayoutDetails = {},
): GateResult {
  const country = getCountry(user.country_code);

  const useCount = country.withdrawQualifyCount > 0;

  const qualifyingDeposits = Math.max(
    0,
    Number(user.qualifying_deposits) || 0
  );

  const totalDeposited = Math.max(
    0,
    Number(user.total_deposited) || 0
  );

  const requiredCount = country.withdrawQualifyCount;
  const requiredAmount = user.qualifyAmount ?? country.withdrawQualifyAmount;

  const progress = useCount
    ? {
        have: qualifyingDeposits,
        need: requiredCount,
        label: `${qualifyingDeposits}/${requiredCount} deposits of ${formatMoney(
          requiredAmount,
          country.currency,
        )}+`,
      }
    : {
        have: totalDeposited,
        need: requiredAmount,
        label: `${formatMoney(totalDeposited, country.currency)} of ${formatMoney(
          requiredAmount,
          country.currency,
        )} deposited`,
      };

  // Gate 1: payout details
  const number = (
    details.number ?? user.payout_number ?? ""
  ).replace(/\s/g, "");

  const bank = details.bank ?? user.payout_bank ?? "";

  if (country.payoutRail === "mobile") {
    const digits = number.replace(/\D/g, "");

    if (digits.length < country.phoneDigits) {
      return {
        ok: false,
        failed: "details",
        message: `Enter a valid ${country.name} mobile money number`,
        progress,
      };
    }
  } else {
    if (number.replace(/\D/g, "").length < 8) {
      return {
        ok: false,
        failed: "details",
        message: "Enter a valid account number",
        progress,
      };
    }

    if (!bank.trim()) {
      return {
        ok: false,
        failed: "details",
        message: "Select your bank",
        progress,
      };
    }
  }

  // Gate 2: deposit qualification
  // This check appears only after the player has won a bet. A player who
  // has never won opens the withdrawal page without it.
  // Ghana: two qualifying deposits of GH₵300 or more.
  // Other countries continue using their own country configuration.
  if (user.hasWonBet !== false && !user.isPartner && !user.withdrawal_approved) {
    if (useCount) {
      if (qualifyingDeposits < requiredCount) {
        const remaining = requiredCount - qualifyingDeposits;

        return {
          ok: false,
          failed: "deposits",
          message: `${remaining} more qualifying deposit${
            remaining === 1 ? "" : "s"
          } of ${formatMoney(
            requiredAmount,
            country.currency,
          )} or more needed.`,
          progress,
        };
      }
    } else if (totalDeposited < requiredAmount) {
      return {
        ok: false,
        failed: "deposits",
        message: `Deposit ${formatMoney(
          requiredAmount - totalDeposited,
          country.currency,
        )} more to meet the withdrawal qualification.`,
        progress,
      };
    }
  }

  // Gate 3: operator approval
  if (!user.withdrawal_approved) {
    return {
      ok: false,
      failed: "approval",
      message:
        "Your withdrawal request has been received and is awaiting approval.",
      progress,
    };
  }

  // Validate withdrawal amount
  const balance = Number(user.balance);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(balance) ||
    amount > balance
  ) {
    return {
      ok: false,
      failed: "details",
      message: "Withdrawal amount is more than your available balance.",
      progress,
    };
  }

  return {
    ok: true,
    progress,
  };
}

/**
 * Determines whether the automatic deposit rule has been satisfied.
 */
export function qualifiesForApproval(user: GateSubject): boolean {
  if (user.isPartner) return true;

  const country = getCountry(user.country_code);

  if (country.withdrawQualifyCount > 0) {
    return (
      Number(user.qualifying_deposits) >=
      country.withdrawQualifyCount
    );
  }

  return (
    Number(user.total_deposited) >=
    (user.qualifyAmount ?? country.withdrawQualifyAmount)
  );
}

/** True when this player has at least one settled winning ticket. */
export async function playerHasWonBet(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("bets")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "won")
    .limit(1)
    .maybeSingle();

  // If the lookup fails, keep the verification in place.
  if (error) return true;
  return Boolean(data);
}

/**
 * Minutes a withdrawal may sit unpaid before the money goes back to the
 * player's wallet. WITHDRAW_REFUND_MINUTES overrides; 0 turns it off.
 */
export function withdrawRefundMinutes(): number {
  const raw = Number(process.env.WITHDRAW_REFUND_MINUTES);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
}

/**
 * Refund every withdrawal still pending past the refund window.
 *
 * Each row is claimed by moving it out of pending first, so a refund can only
 * happen once, and once a row is refunded the admin "Mark paid" button can no
 * longer claim it. Runs lazily from the player poll and the admin list, since
 * there is no scheduler. Pass a userId to sweep one player only.
 */
export async function refundStaleWithdrawals(
  supabase: SupabaseClient,
  userId?: string,
): Promise<number> {
  const minutes = withdrawRefundMinutes();
  if (minutes <= 0) return 0;
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();

  let query = supabase
    .from("payments")
    .select("reference, user_id, amount, metadata")
    .eq("status", "pending")
    .eq("metadata->>type", "withdrawal")
    .lt("created_at", cutoff)
    .limit(50);
  if (userId) query = query.eq("user_id", userId);

  const { data: stale, error } = await query;
  if (error || !stale?.length) return 0;

  // A sub-admin's withdrawal stays deducted: it is never auto-refunded, it
  // waits for the admin to pay it.
  const { data: owners } = await supabase
    .from("users")
    .select("id, phone, email")
    .in("id", [...new Set(stale.map((r) => r.user_id))]);
  const index = await subAdminIndex();
  const subAdminIds = new Set(
    (owners ?? []).filter((u) => isSubAdminAccount(u, index)).map((u) => u.id),
  );

  let refunded = 0;
  for (const row of stale) {
    if (subAdminIds.has(row.user_id)) continue;
    const now = new Date().toISOString();
    const { data: claimed } = await supabase
      .from("payments")
      .update({
        status: "failed",
        resolved_at: now,
        metadata: {
          ...(row.metadata ?? {}),
          auto_refunded: true,
          refund_reason: `Not paid within ${minutes} minutes`,
          refunded_at: now,
        },
      })
      .eq("reference", row.reference)
      .eq("status", "pending")
      .select("reference")
      .maybeSingle();
    if (!claimed) continue; // Paid or refunded by someone else first.

    const amount = Number(row.amount);
    // Conditional on the balance read, so a bet placed at the same moment
    // cannot be overwritten. Retry a few times if it moved.
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      const { data: user } = await supabase
        .from("users")
        .select("balance, total_withdrawn")
        .eq("id", row.user_id)
        .maybeSingle();
      if (!user) break;
      const { data: done } = await supabase
        .from("users")
        .update({
          balance: Number(user.balance) + amount,
          total_withdrawn: Math.max(0, Number(user.total_withdrawn) - amount),
          // A refunded withdrawal sends the player back through the deposit
          // verification (0/2), the same as an admin rejection does. Approval
          // is cleared too, because an approved player skips that check.
          qualifying_deposits: 0,
          withdrawal_approved: false,
        })
        .eq("id", row.user_id)
        .eq("balance", user.balance)
        .select("id")
        .maybeSingle();
      ok = Boolean(done);
    }

    if (ok) {
      refunded++;
      console.info("[withdrawal] auto-refunded", { reference: row.reference, user: row.user_id, amount });
    } else {
      // Put it back to pending so the next sweep tries again.
      await supabase
        .from("payments")
        .update({ status: "pending", resolved_at: null, metadata: row.metadata })
        .eq("reference", row.reference);
      console.error("[withdrawal] AUTO-REFUND FAILED, will retry", row.user_id, amount, row.reference);
    }
  }
  return refunded;
}

/** User ids in this list that have a settled winning ticket. */
export async function wonBetUserIds(supabase: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("bets")
    .select("user_id")
    .eq("status", "won")
    .in("user_id", userIds);

  if (error) return new Set(userIds);
  return new Set((data ?? []).map((row) => String(row.user_id)));
}
