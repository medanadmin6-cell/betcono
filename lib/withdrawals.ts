
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCountry, formatMoney } from "./countries";

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
  const requiredAmount = country.withdrawQualifyAmount;

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
  // Ghana: three qualifying deposits of GH₵300 or more.
  // A deposit already made to stake counts, so one done leaves two more.
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
    country.withdrawQualifyAmount
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
