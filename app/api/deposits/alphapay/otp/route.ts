import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { ALPHAPAY_BASE } from "@/lib/gateways";

export const dynamic = "force-dynamic";

/** Forwards the code the player typed to AlphaPay's verify-otp endpoint. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? "");
  const code = String(body?.code ?? "").trim();
  if (!reference || !code) {
    return NextResponse.json({ error: "Enter the code" }, { status: 400 });
  }

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: payment } = await supabase
    .from("payments")
    .select("reference, provider")
    .eq("reference", reference)
    .eq("provider", "alphapay")
    .maybeSingle();

  if (!payment) return NextResponse.json({ error: "Unknown payment" }, { status: 404 });

  try {
    const res = await fetch(`${ALPHAPAY_BASE}/${encodeURIComponent(reference)}/verify-otp/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error?.message ?? json?.message;
      return NextResponse.json(
        { error: typeof message === "string" ? message : "That code was not accepted" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[alphapay] otp", err);
    return NextResponse.json({ error: "That code was not accepted" }, { status: 502 });
  }
}
