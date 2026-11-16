import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getCountry } from "@/lib/countries";
import {
  checkWithdrawalGate,
  playerHasWonBet,
  partnerMinimum,
  qualifyAmountFrom,
  refundStaleWithdrawals,
  refundedWithdrawalCount,
  qualifyCountFor,
} from "@/lib/withdrawals";
import { subAdminIndex, isSubAdminAccount } from "@/lib/partner-accounts";
import { isFrozen, freezeEnabled, FROZEN_MESSAGE } from "@/lib/schema";
import { supportDigits } from "@/lib/support-numbers";

/** How often the light poll bothers to look for a player's stale withdrawals. */
const LITE_SWEEP_MS = 120_000;
const lastLiteSweep = new Map<string, number>();

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

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The header asks every 30 seconds, from every open tab, and only wants the
  // balance and whether the account is frozen. Answering that with the full
  // record cost nine queries a poll and was most of the load on the database.
  // The light form is one query, plus the refund sweep every couple of minutes.
  if (url.searchParams.get("lite") === "1") {
    const now = Date.now();
    if (now - (lastLiteSweep.get(userId) ?? 0) > LITE_SWEEP_MS) {
      if (lastLiteSweep.size > 5000) lastLiteSweep.clear();
      lastLiteSweep.set(userId, now);
      await refundStaleWithdrawals(supabase, userId).catch((e) =>
        console.error("[withdrawal] sweep failed", e),
      );
    }

    const canFreeze = await freezeEnabled();
    const { data: row, error: liteErr } = await supabase
      .from("users")
      .select(canFreeze ? "id, balance, frozen" : "id, balance")
      .eq("id", userId)
      .maybeSingle();
    if (liteErr || !row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const lite = row as unknown as { id: string; balance: number; frozen?: boolean };
    if (lite.frozen) {
      return NextResponse.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
    }
    return NextResponse.json({ user: { id: lite.id, balance: lite.balance } });
  }

  // These lookups used to run one after another, seven round trips before the
  // withdraw page could show anything. They do not depend on each other, so
  // they now go out together.
  //
  // Only the sweep has an order: unpaid withdrawals past the refund window go
  // back to the wallet before the balance and the refund count are read, so
  // the player sees the refund on this poll.
  const account = (async () => {
    await refundStaleWithdrawals(supabase, userId).catch((e) =>
      console.error("[withdrawal] sweep failed", e),
    );
    const [found, frozen, refunds] = await Promise.all([
      supabase
        .from("users")
        .select(
          "id, name, phone, email, country_code, currency, balance, total_deposited, total_withdrawn, verification_step, qualifying_deposits, withdrawal_approved, payout_number, payout_bank, bonus_paid, referred_by, created_at",
        )
        .eq("id", userId)
        .maybeSingle(),
      isFrozen(userId),
      refundedWithdrawalCount(supabase, userId),
    ]);
    // The partner's deposit adjustment needs the referrer off the player row.
    const partnerMin = found.data ? await partnerMinimum(supabase, found.data.referred_by) : null;
    return { found, frozen, refunds, partnerMin };
  })();

  const [{ found, frozen, refunds, partnerMin }, index, hasWonBet, stakedRes, partnerRes] =
    await Promise.all([
      account,
      subAdminIndex(),
      playerHasWonBet(supabase, userId),
      // Tier points come from turnover, so they are summed off the stakes.
      supabase.from("bets").select("stake").eq("user_id", userId),
      // A partner betting on their own account sees a way back to the dashboard.
      supabase
        .from("sub_admins")
        .select("id, referral_code, approved")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  const { data: user, error } = found;
  if (error || !user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (frozen) {
    return NextResponse.json({ error: FROZEN_MESSAGE, frozen: true }, { status: 403 });
  }

  const country = getCountry(user.country_code);
  // Only a sub-admin account skips deposit verification. An admin cookie
  // does not unlock a different player's withdrawal.

  let depositMin = country.minDeposit;
  let firstDepositMin = country.minFirstDeposit;
  // The partner's deposit adjustment is the minimum for their players, first
  // deposit included, never below the country's normal minimum.
  if (partnerMin) {
    depositMin = Math.max(country.minDeposit, partnerMin);
    firstDepositMin = depositMin;
  }

  // Each qualifying deposit follows the partner's deposit adjustment.
  const qualifyAmount = qualifyAmountFrom(user.country_code, partnerMin);
  const gate = checkWithdrawalGate(
    {
      ...user,
      isPartner: isSubAdminAccount(user, index),
      hasWonBet,
      qualifyAmount,
      qualifyCount: qualifyCountFor(user.country_code, refunds),
    },
    0,
  );

  const tierPoints = (stakedRes.data ?? []).reduce((sum, b) => sum + Number(b.stake), 0);
  const partner = partnerRes.data;

  let support: { phone: string | null; whatsapp: string | null } | null = null;
  if (user.referred_by) {
    const { data: lines, error: linesErr } = await supabase
      .from("sub_admins")
      .select("support_phone, support_whatsapp")
      .eq("id", user.referred_by)
      .maybeSingle();
    if (!linesErr && lines) {
      const phone = supportDigits(lines.support_phone);
      const whatsapp = supportDigits(lines.support_whatsapp);
      if (phone || whatsapp) support = { phone, whatsapp };
    }
  }

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
    support,
    tierPoints: Math.floor(tierPoints),
  });
}
