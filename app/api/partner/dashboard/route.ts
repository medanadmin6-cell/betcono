import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { currentPartner, publicPartner } from "@/lib/partner";
import { formatMoney, getCountry } from "@/lib/countries";

export const dynamic = "force-dynamic";

/** Referred players, their deposits and the partner's earnings. */
export async function GET() {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const partner = await currentPartner();
  if (!partner) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: players } = await supabase
    .from("users")
    .select("id, name, phone, country_code, currency, total_deposited, created_at")
    .eq("referred_by", partner.id)
    .order("created_at", { ascending: false })
    // A partner with 381 members was shown 200 of them and never told the
    // rest existed. They are all theirs; they all count toward commission.
    .limit(2000);

  const { data: commissions } = await supabase
    .from("commissions")
    .select("id, user_id, deposit_amount, currency, rate, amount, created_at")
    .eq("sub_admin_id", partner.id)
    .order("created_at", { ascending: false })
    .limit(200);

  // The partner's own betting wallet, when they have opened one.
  let wallet = null;
  if (partner.user_id) {
    const { data } = await supabase
      .from("users")
      .select("id, name, phone, email, country_code, currency, balance")
      .eq("id", partner.user_id)
      .maybeSingle();
    wallet = data ?? null;
  }

  // What they have self-credited in the last 24 hours, for the limit meter.
  let creditedToday = 0;
  if (partner.user_id) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recent } = await supabase
      .from("payments")
      .select("amount")
      .eq("user_id", partner.user_id)
      .eq("provider", "partner")
      .gte("created_at", since);
    creditedToday = (recent ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  }

  const country = getCountry(wallet?.country_code ?? "GH");
  const { data: minimumRow, error: minimumErr } = await supabase
    .from("sub_admins")
    .select("min_deposit")
    .eq("id", partner.id)
    .maybeSingle();

  return NextResponse.json({
    partner: publicPartner(partner),
    players: players ?? [],
    commissions: commissions ?? [],
    wallet,
    creditedToday: Math.round(creditedToday * 100) / 100,
    dailyLimit: Number(process.env.PARTNER_CREDIT_DAILY_MAX ?? 20000),
    depositMinimum: minimumErr ? null : minimumRow?.min_deposit ?? null,
    depositCurrency: country.currency,
    depositFloor: country.minDeposit,
    depositCeiling: country.maxDeposit,
  });
}

/**
 * Where the partner wants to be paid. These fields are free text, because
 * partners span many markets and a fixed list would block a legitimate payout
 * method the day a new market opens.
 */
export async function PATCH(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const partner = await currentPartner();
  if (!partner) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (body.min_deposit !== undefined) {
    const amount = Number(body.min_deposit);
    let countryCode = "GH";
    if (partner.user_id) {
      const { data: wallet } = await supabase
        .from("users")
        .select("country_code")
        .eq("id", partner.user_id)
        .maybeSingle();
      if (wallet?.country_code) countryCode = wallet.country_code;
    }
    const country = getCountry(countryCode);
    if (!Number.isFinite(amount) || amount < country.minDeposit || amount > country.maxDeposit) {
      return NextResponse.json(
        {
          error: `Enter a minimum from ${formatMoney(country.minDeposit, country.currency)} to ${formatMoney(country.maxDeposit, country.currency)}`,
        },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("sub_admins")
      .update({ min_deposit: Math.round(amount * 100) / 100 })
      .eq("id", partner.id);
    if (error) {
      console.error("[partner] could not save deposit minimum", partner.id, error);
      return NextResponse.json({ error: "Could not save the deposit minimum" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  await supabase
    .from("sub_admins")
    .update({
      payout_name: String(body.payout_name ?? "").trim() || null,
      payout_network: String(body.payout_network ?? "").trim() || null,
      payout_number: String(body.payout_number ?? "").trim() || null,
    })
    .eq("id", partner.id);

  return NextResponse.json({ ok: true });
}
