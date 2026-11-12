import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/supabase";
import { adapterFor, settledAmount } from "@/lib/gateways";
import { applyDepositCredit } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * AlphaPay's callback_url. Two different things arrive here:
 *
 *  - POST: the signed payment.succeeded webhook.
 *  - GET: the player's own browser, if they ever finish on AlphaPay's hosted
 *    page instead of ours.
 *
 * The webhook is best-effort on AlphaPay's side (no retries), so it is only a
 * shortcut. The checkout poll and the reconcile sweep are what guarantee the
 * credit.
 */

function signatureMatches(raw: string, header: string | null): boolean {
  const key = process.env.ALPHAPAY_SECRET_KEY;
  if (!key || !header) return false;
  const expected = createHmac("sha256", key).update(raw).digest("hex");
  const given = header.trim().toLowerCase().replace(/^sha256=/, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });

  // The signature is checked over the raw body before anything is read out of it.
  const raw = await req.text();
  if (!signatureMatches(raw, req.headers.get("x-alphapay-signature"))) {
    console.warn("[alphapay] webhook rejected, bad signature");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const data = (event.data ?? {}) as Record<string, unknown>;
  const reference = typeof data.reference === "string" ? data.reference : "";
  if (!reference) return NextResponse.json({ ok: true, ignored: true });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, user_id, amount, currency, provider, status, metadata")
    .eq("reference", reference)
    .eq("provider", "alphapay")
    .maybeSingle();

  if (!payment || payment.status !== "pending") return NextResponse.json({ ok: true, ignored: true });

  // The webhook only says where to look. What gets credited is what AlphaPay's
  // own verify endpoint reports, the same as every other credit path.
  const outcome = await adapterFor("alphapay")!.status(
    reference,
    (payment.metadata ?? undefined) as Record<string, unknown> | undefined,
  );

  if (outcome.status === "confirmed") {
    await applyDepositCredit({
      userId: payment.user_id,
      amount: settledAmount(outcome, Number(payment.amount), payment.currency),
      currency: payment.currency,
      reference,
      provider: payment.provider,
    });
  } else if (outcome.status === "failed") {
    await supabase.from("payments").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("ref");
  // The account page sweeps up pending deposits on load, so the credit lands
  // there whether or not a reference came back with the player.
  const target = reference ? `/account?ref=${encodeURIComponent(reference)}` : "/account";
  return NextResponse.redirect(new URL(target, url.origin));
}
