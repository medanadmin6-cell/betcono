import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/supabase";
import { adapterFor, settledAmount, type ChargeOutcome } from "@/lib/gateways";
import { applyDepositCredit } from "@/lib/money";

export const dynamic = "force-dynamic";

const PAID = new Set(["success", "successful", "paid", "completed", "confirmed"]);

/**
 * Hex HMAC-SHA256 of the raw body, compared without leaking which bytes differed.
 * A missing secret or a bad header is a rejection, never a credit.
 */
function signatureMatches(raw: Buffer, header: string | null): boolean {
  const secret = process.env.PAYPULSE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function majorAmount(value: unknown): number | undefined {
  const paid = typeof value === "string" ? Number(value.replace(/,/g, "").trim()) : Number(value);
  return Number.isFinite(paid) && paid > 0 ? paid : undefined;
}

/**
 * PayPulse payment.success.
 *
 * The player's browser comes back to /deposit and only polls. This route is
 * what credits, and only after X-PayPulse-Signature matches the raw body.
 * data.amount is the sum the customer paid. The fee is not subtracted.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });

  const raw = Buffer.from(await req.arrayBuffer());
  if (!signatureMatches(raw, req.headers.get("x-paypulse-signature"))) {
    console.warn("[paypulse] webhook rejected, bad signature");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw.toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    event = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const name = String(event.event ?? event.type ?? "").toLowerCase();
  if (name && name !== "payment.success") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = (
    event.data && typeof event.data === "object" ? event.data : {}
  ) as Record<string, unknown>;
  const reported = String(data.status ?? "").toLowerCase();
  if (reported && !PAID.has(reported)) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (!name && !reported) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const reference =
    typeof data.merchant_reference === "string" ? data.merchant_reference.trim() : "";
  if (!reference) return NextResponse.json({ ok: true, ignored: true });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, user_id, amount, currency, provider, status, metadata")
    .eq("reference", reference)
    .eq("provider", "paypulse")
    .maybeSingle();

  if (!payment) return NextResponse.json({ ok: true, ignored: true });
  if (payment.status === "confirmed" || payment.status === "resolved") {
    return NextResponse.json({ ok: true });
  }
  if (payment.status !== "pending" && payment.status !== "failed") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const paid = majorAmount(data.amount);
  const paidCurrency =
    typeof data.currency === "string" && data.currency.trim()
      ? data.currency
      : String(payment.currency);

  let outcome: ChargeOutcome;
  if (reported && PAID.has(reported) && paid) {
    // The signed payload says what was paid. Do not replace it with a net figure.
    outcome = { status: "confirmed", paidAmount: paid, paidCurrency };
  } else {
    const checked = await adapterFor("paypulse")!.status(
      reference,
      (payment.metadata ?? undefined) as Record<string, unknown> | undefined,
    );
    if (checked.status !== "confirmed") return NextResponse.json({ ok: true, ignored: true });
    outcome = {
      status: "confirmed",
      paidAmount: paid ?? checked.paidAmount,
      paidCurrency: paid ? paidCurrency : (checked.paidCurrency ?? paidCurrency),
    };
  }

  await applyDepositCredit({
    userId: payment.user_id,
    amount: settledAmount(outcome, Number(payment.amount), payment.currency),
    currency: payment.currency,
    reference,
    provider: payment.provider,
  });

  return NextResponse.json({ ok: true });
}
