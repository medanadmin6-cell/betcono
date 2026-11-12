import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { alphapayInitialize } from "@/lib/gateways";

export const dynamic = "force-dynamic";

/**
 * Sends a fresh code, to the same number or to a corrected one. AlphaPay has
 * no resend call of its own: initializing the same reference again is how a
 * new code is issued.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? "");
  const typed = String(body?.phone ?? "").replace(/\D/g, "");
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  if (typed && typed.length < 9) {
    return NextResponse.json({ error: "Enter the mobile money number" }, { status: 400 });
  }

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, amount, currency, status, provider, metadata")
    .eq("reference", reference)
    .eq("provider", "alphapay")
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Unknown payment" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "This deposit is already closed" }, { status: 409 });
  }

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  if (meta.otp_verified === true) {
    return NextResponse.json({ error: "The code was already confirmed. Approve the prompt on your phone." }, { status: 409 });
  }

  const phone = typed || (typeof meta.phone === "string" ? meta.phone : "");
  if (!phone) return NextResponse.json({ error: "Enter the mobile money number" }, { status: 400 });

  const init = await alphapayInitialize({
    reference,
    amount: Number(payment.amount),
    currency: payment.currency,
    phone,
    origin: new URL(req.url).origin,
  });
  if (!init.ok) return NextResponse.json({ error: init.error }, { status: 502 });

  await supabase
    .from("payments")
    .update({ metadata: { ...meta, phone: init.phone, otp_required: init.otpRequired } })
    .eq("reference", reference);

  return NextResponse.json({ ok: true, phone: init.phone, step: init.otpRequired ? "otp" : "prompt" });
}
