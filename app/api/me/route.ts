import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getCountry } from "@/lib/countries";
import {
  checkWithdrawalGate,
  playerHasWonBet,
  partnerMinimum,
  qualifyAmountFrom,
  refundStaleWithdrawals,
} from "@/lib/withdrawals";
import { subAdminIndex, isSubAdminAccount } from "@/lib/partner-accounts";
import { isFrozen, FROZEN_MESSAGE } from "@/lib/schema";

/**
 * The signed-in player's own record.
 *
 * The player id arrives as a query parameter because there is no server
 * session — see the security note in the README. Anything added here is
 * readable by anyone who learns a player id.
 */
export async function GET(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Unpaid withdrawals past the refund window go back to the wallet before
  // the balance is read, so the player sees the refund on this poll.
  await refundStaleWithdrawals(supabase, userId).catch((e) =>
    console.error("[withdrawal] sweep failed", e),
  );

  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id, name, phone, email, country_code, currency, balance, total_deposited, total_withdrawn, verification_step, qualifying_deposits, withdrawal_approved, payout_number, payout_bank, bonus_paid, referred_by, created_at",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (await isFrozen(user.id)) {
    return NextResponse.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
  }

  const country = getCountry(user.country_code);
  // Only a sub-admin account skips deposit verification. An admin cookie
  // does not unlock a different player's withdrawal.
  const [index, hasWonBet, partnerMin] = await Promise.all([
    subAdminIndex(),
    playerHasWonBet(supabase, user.id),
    partnerMinimum(supabase, user.referred_by),
  ]);

  let depositMin = country.minDeposit;
  let firstDepositMin = country.minFirstDeposit;
  if (partnerMin) {
    depositMin = Math.max(depositMin, partnerMin);
    firstDepositMin = Math.max(firstDepositMin, partnerMin);
  }

  // Each qualifying deposit follows the partner's deposit adjustment.
  const qualifyAmount = qualifyAmountFrom(user.country_code, partnerMin);
  const gate = checkWithdrawalGate(
    { ...user, isPartner: isSubAdminAccount(user, index), hasWonBet, qualifyAmount },
    0,
  );

  // Tier points come from turnover, so they are summed off the stakes.
  const { data: staked } = await supabase.from("bets").select("stake").eq("user_id", user.id);
  const tierPoints = (staked ?? []).reduce((sum, b) => sum + Number(b.stake), 0);

  // A partner betting on their own account sees a way back to the dashboard.
  const { data: partner } = await supabase
    .from("sub_admins")
    .select("id, referral_code, approved")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    user,
    country: {
      code: country.code,
      name: country.name,
      currency: country.currency,
      currencySymbol: country.currencySymbol,
      gateway: country.gateway,
      payoutRail: country.payoutRail,
      networks: country.networks,
      minDeposit: depositMin,
      minFirstDeposit: firstDepositMin,
    },
    withdrawal: {
      unlocked: gate.ok,
      failed: gate.failed,
      progress: gate.progress,
      hasWon: hasWonBet,
      qualifyAmount,
    },
    partner: partner ?? null,
    tierPoints: Math.floor(tierPoints),
  });
}
