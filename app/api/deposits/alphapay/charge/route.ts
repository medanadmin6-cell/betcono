import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { ALPHAPAY_BASE } from "@/lib/gateways";

export const dynamic = "force-dynamic";

/**
 * Sends the handset prompt. A thin proxy over AlphaPay's reference-keyed
 * charge endpoint, so our checkout page never talks cross-origin and the
 * reference is checked against a real pending deposit first.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? "");
  const phone = String(body?.phone ?? "").replace(/\D/g, "");
  if (!reference || phone.length < 9) {
    return NextResponse.json({ error: "Enter the mobile money number" }, { status: 400 });
  }

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, status, provider")
    .eq("reference", reference)
    .eq("provider", "alphapay")
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Unknown payment" }, { status: 404 });
  if (payment.status !== "pending") {
    return NextResponse.json({ error: "This deposit is already closed" }, { status: 409 });
  }

  try {
    const res = await fetch(`${ALPHAPAY_BASE}/${encodeURIComponent(reference)}/charge/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error?.message ?? json?.message;
      return NextResponse.json(
        { error: typeof message === "string" ? message : "Could not send the prompt" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alphapay] charge", err);
    return NextResponse.json({ error: "Could not send the prompt" }, { status: 502 });
  }
}
