
import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getCountry } from "@/lib/countries";
import { checkWithdrawalGate } from "@/lib/withdrawals";
import {
  subAdminIndex,
  isSubAdminAccount,
} from "@/lib/partner-accounts";
import { paymentReference } from "@/lib/codes";
import {
  sendSms,
  withdrawalRequestedSms,
} from "@/lib/sms";
import { requireAdmin } from "@/lib/admin-guard";

interface WithdrawBody {
  userId?: string;
  amount?: number;
  payoutNumber?: string;
  payoutBank?: string;
}

export async function POST(req: Request) {
  const supabase = db();

  if (!supabase) {
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503 }
    );
  }

  let body: WithdrawBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }

  const amount = Number(body.amount);

  if (!body.userId) {
    return NextResponse.json(
      { error: "Sign in first" },
      { status: 401 }
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter a valid withdrawal amount" },
      { status: 400 }
    );
  }

  // Load player
  const { data: user, error: userError } = await supabase
    .from("users")
    // A literal string, not a joined array: supabase-js types the row from it.
    .select(
      "id, phone, email, country_code, currency, balance, total_deposited, total_withdrawn, qualifying_deposits, withdrawal_approved, payout_number, payout_bank"
    )
    .eq("id", body.userId)
    .maybeSingle();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Sign in first" },
      { status: 401 }
    );
  }

  // Determine account privileges
  const [index, isAdmin] = await Promise.all([
    subAdminIndex(),
    requireAdmin(),
  ]);

  const exempt =
    isSubAdminAccount(user, index) || isAdmin;

  const subject = {
    ...user,
    isPartner: exempt,
  };

  // Check all withdrawal gates
  const gate = checkWithdrawalGate(
    subject,
    amount,
    {
      number: body.payoutNumber,
      bank: body.payoutBank,
    }
  );

  // Save payout details
  const payoutNumber =
    body.payoutNumber?.trim() ||
    user.payout_number;

  const payoutBank =
    body.payoutBank?.trim() ||
    user.payout_bank;

  if (
    payoutNumber !== user.payout_number ||
    payoutBank !== user.payout_bank
  ) {
    const { error: payoutError } = await supabase
      .from("users")
      .update({
        payout_number: payoutNumber,
        payout_bank: payoutBank,
      })
      .eq("id", user.id);

    if (payoutError) {
      return NextResponse.json(
        { error: "Could not save payout details" },
        { status: 500 }
      );
    }
  }

  // Handle failed gates
  if (!gate.ok) {
    // Approval gate means the request can be submitted
    // as pending, subject to the balance check.
    if (gate.failed !== "approval") {
      return NextResponse.json(
        {
          error: gate.message,
          gate: gate.failed,
          progress: gate.progress,
        },
        { status: 400 }
      );
    }
  }

  const balance = Number(user.balance);
  const totalWithdrawn =
    Number(user.total_withdrawn) || 0;

  if (
    !Number.isFinite(balance) ||
    amount > balance
  ) {
    return NextResponse.json(
      { error: "Amount is more than your balance" },
      { status: 400 }
    );
  }

  const country = getCountry(user.country_code);

  // Create withdrawal timing information
  const requestedAt = new Date();

  const statusCheckAt = new Date(
    requestedAt.getTime() + 15 * 60 * 1000
  );

  const reference = paymentReference("WDR");

  const awaitingApproval =
    gate.failed === "approval";

  const metadata = {
    type: "withdrawal",
    awaiting_approval: awaitingApproval,
    rail: country.payoutRail,
    payout_number: payoutNumber,
    payout_bank: payoutBank,
    requested_at: requestedAt.toISOString(),
    status_check_after: statusCheckAt.toISOString(),
    processing_window_minutes: 15,
  };

  // IMPORTANT:
  // For production, perform the wallet debit and payment
  // insertion together inside a PostgreSQL RPC transaction.
  //
  // The conditional balance update below prevents two
  // requests from spending the same available balance.

  const { data: debited, error: debitError } =
    await supabase
      .from("users")
      .update({
        balance: balance - amount,
        total_withdrawn: totalWithdrawn + amount,
      })
      .eq("id", user.id)
      .eq("balance", balance)
      .select("id")
      .maybeSingle();

  if (debitError || !debited) {
    return NextResponse.json(
      { error: "Your balance changed. Try again." },
      { status: 409 }
    );
  }

  // Record withdrawal in payment ledger
  const { error: ledgerError } = await supabase
    .from("payments")
    .insert({
      reference,
      user_id: user.id,
      amount,
      currency: user.currency,
      provider: "manual",
      status: "pending",
      metadata,
    });

  // Roll back the debit if ledger insertion fails
  if (ledgerError) {
    console.error(
      "[withdrawal] Ledger write failed",
      user.id,
      ledgerError
    );

    // Use an atomic database refund RPC in production.
    // Do not blindly overwrite a balance that may have
    // changed through another concurrent transaction.

    return NextResponse.json(
      {
        error:
          "Withdrawal could not be recorded. Contact support before submitting again.",
        reference,
      },
      { status: 500 }
    );
  }

  // Notify player
  await sendSms(
    user.phone,
    withdrawalRequestedSms(amount, user.currency)
  ).catch((error) => {
    console.error("[withdrawal] SMS failed", error);
  });

  return NextResponse.json({
    status: "processing",
    reference,
    amount,
    balance: balance - amount,
    currency: user.currency,
    message: awaitingApproval
      ? "Your withdrawal request has been received and is awaiting operator approval."
      : "Your withdrawal request has been submitted and is being processed.",
    requestedAt: requestedAt.toISOString(),
    statusCheckAt: statusCheckAt.toISOString(),
    processingMinutes: 15,
    notify: exempt,
  });
}
