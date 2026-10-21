import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getCountry } from "@/lib/countries";
import { checkWithdrawalGate } from "@/lib/withdrawals";
import { subAdminIndex, isSubAdminAccount } from "@/lib/partner-accounts";
import { paymentReference } from "@/lib/codes";
import { sendSms, withdrawalRequestedSms } from "@/lib/sms";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * Request a withdrawal.
 *
 * Three gates in order, and the player only sees the first one they fail. The
 * rule itself lives in lib/withdrawals so the withdraw sheet, this endpoint and
 * the admin players list can never drift apart.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: { userId?: string; amount?: number; payoutNumber?: string; payoutBank?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!body.userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const { data: user } = await supabase
    .from("users")
    .select(
      "id, phone, email, country_code, currency, balance, total_deposited, total_withdrawn, qualifying_deposits, withdrawal_approved, payout_number, payout_bank",
    )
    .eq("id", body.userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const [index, isAdmin] = await Promise.all([subAdminIndex(), requireAdmin()]);
  // The banner is only for our own accounts. Every sub-admin skips the deposit
  // check, approved or not. The operator's console session does too, because
  // that login is not a player row and would otherwise sit on the same check.
  const exempt = isSubAdminAccount(user, index) || isAdmin;
  const subject = { ...user, isPartner: exempt };
  const gate = checkWithdrawalGate(subject, amount, {
    number: body.payoutNumber,
    bank: body.payoutBank,
  });

  // Save the payout details for next time, whether or not the gate opens.
  const payoutNumber = body.payoutNumber?.trim() || user.payout_number;
  const payoutBank = body.payoutBank?.trim() || user.payout_bank;

  if (payoutNumber !== user.payout_number || payoutBank !== user.payout_bank) {
    await supabase
      .from("users")
      .update({ payout_number: payoutNumber, payout_bank: payoutBank })
      .eq("id", user.id);
  }

  if (!gate.ok) {
    // Gate 3 is not a refusal. The request is recorded as pending and the
    // player is told it is being processed, rather than shown a lock screen.
    if (gate.failed === "approval") {
      // The gate stops at approval before it ever reaches its own balance
      // check, so this path has to make it itself.
      const held = Number(user.balance);
      if (!(amount > 0) || amount > held) {
        return NextResponse.json({ error: "Amount is more than your balance" }, { status: 400 });
      }

      // The money leaves the balance when the request is made, not when it is
      // paid. Otherwise the same balance can be requested again and again
      // while the first request is still waiting for an operator.
      const { data: debited } = await supabase
        .from("users")
        .update({
          balance: held - amount,
          total_withdrawn: Number(user.total_withdrawn) + amount,
        })
        .eq("id", user.id)
        .eq("balance", held)
        .select("id")
        .maybeSingle();

      if (!debited) {
        return NextResponse.json({ error: "Your balance changed. Try again." }, { status: 409 });
      }

      const reference = paymentReference("WDR");
      const { error: ledgerErr } = await supabase.from("payments").insert({
        reference,
        user_id: user.id,
        amount,
        currency: user.currency,
        provider: "manual",
        status: "pending",
        metadata: {
          type: "withdrawal",
          awaiting_approval: true,
          payout_number: payoutNumber,
          payout_bank: payoutBank,
        },
      });

      if (ledgerErr) {
        console.error("[withdrawal] ledger write failed, refunding", user.id, ledgerErr);
        await supabase
          .from("users")
          .update({ balance: held, total_withdrawn: Number(user.total_withdrawn) })
          .eq("id", user.id);
        return NextResponse.json({ error: "Could not submit your withdrawal" }, { status: 500 });
      }

      await sendSms(user.phone, withdrawalRequestedSms(amount, user.currency)).catch(() => {});

      return NextResponse.json({
        status: "processing",
        reference,
        amount,
        balance: held - amount,
        currency: user.currency,
        message: gate.message,
        notify: exempt,
      });
    }

    return NextResponse.json({ error: gate.message, gate: gate.failed, progress: gate.progress }, { status: 400 });
  }

  // --- All three gates passed: take the money out ------------------------
  const balance = Number(user.balance);
  const { data: debited } = await supabase
    .from("users")
    .update({
      balance: balance - amount,
      total_withdrawn: Number(user.total_withdrawn) + amount,
    })
    .eq("id", user.id)
    .eq("balance", balance)
    .select("id")
    .maybeSingle();

  if (!debited) {
    return NextResponse.json({ error: "Your balance changed. Try again." }, { status: 409 });
  }

  const country = getCountry(user.country_code);
  const reference = paymentReference("WDR");

  const { error } = await supabase.from("payments").insert({
    reference,
    user_id: user.id,
    amount,
    currency: user.currency,
    provider: "manual",
    status: "pending",
    metadata: {
      type: "withdrawal",
      awaiting_approval: false,
      rail: country.payoutRail,
      payout_number: payoutNumber,
      payout_bank: payoutBank,
    },
  });

  if (error) {
    console.error("[withdrawal] ledger write failed, refunding", user.id, error);
    await supabase
      .from("users")
      .update({ balance, total_withdrawn: Number(user.total_withdrawn) })
      .eq("id", user.id);
    return NextResponse.json({ error: "Could not submit your withdrawal" }, { status: 500 });
  }

  await sendSms(user.phone, withdrawalRequestedSms(amount, user.currency)).catch(() => {});

  return NextResponse.json({
    status: "submitted",
    reference,
    amount,
    balance: balance - amount,
    currency: user.currency,
    message: "Your withdrawal is on its way. It is usually paid within a few minutes.",
    notify: exempt,
  });
}
