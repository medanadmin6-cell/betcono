import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * What our checkout page needs to render: the figure, the currency and a
 * phone prefill. Keyed by the payment reference, which is unguessable, the
 * same way the gateway's own charge endpoints are.
 */
export async function GET(req: Request) {
  const reference = new URL(req.url).searchParams.get("reference") ?? "";
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, amount, currency, status, provider, metadata")
    .eq("reference", reference)
    .eq("provider", "alphapay")
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Unknown payment" }, { status: 404 });

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    reference: payment.reference,
    amount: Number(payment.amount),
    currency: payment.currency,
    status: payment.status,
    phone: typeof meta.phone === "string" ? meta.phone : "",
  });
}
