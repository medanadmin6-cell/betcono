import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { getCountry, normalisePhone, validateKyc } from "@/lib/countries";

type Db = NonNullable<ReturnType<typeof db>>;

/** An approved partner's code is the only way an account can be opened. */
async function approvedPartner(
  supabase: Db,
  code: string,
): Promise<{ id: string } | null | "unavailable"> {
  // A database that did not answer is not the same as a code that does not
  // exist. Telling a player their good code is "not valid" because a query
  // timed out sends them away for nothing, so the lookup is tried twice and a
  // failure is reported as what it is.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: partner, error } = await supabase
      .from("sub_admins")
      .select("id, approved")
      .eq("referral_code", code)
      .maybeSingle();
    if (error) {
      console.error("[register] referral lookup failed", attempt, error.message);
      continue;
    }
    return partner?.approved ? { id: partner.id } : null;
  }
  return "unavailable";
}

const CODE_CHECK_DOWN = "We could not check your referral code just now. Please try again in a moment.";

/** Lets the sign-up screen check a code before it shows the account form. */
export async function GET(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const code = new URL(req.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (!code) {
    return NextResponse.json({ error: "Enter your referral code" }, { status: 400 });
  }

  const partner = await approvedPartner(supabase, code);
  if (partner === "unavailable") {
    return NextResponse.json({ error: CODE_CHECK_DOWN }, { status: 503 });
  }
  if (!partner) {
    return NextResponse.json({ error: "That referral code is not valid" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Registration. The country decides everything downstream — wallet currency,
 * minimum deposit, the KYC value demanded, the gateway and the payout rail —
 * so it is validated first and stamped onto the player.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { name, phone, email, password, countryCode, kycValue, referralCode } = body;

  // Sign-up is invite-only: every player must arrive through a partner's code.
  const code = referralCode?.trim().toUpperCase() ?? "";
  if (!code) {
    return NextResponse.json({ error: "A referral code is required to sign up" }, { status: 400 });
  }

  if (!name?.trim()) return NextResponse.json({ error: "Enter your name" }, { status: 400 });
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const country = getCountry(countryCode);

  const normalisedPhone = normalisePhone(phone ?? "", country.code);
  if (!normalisedPhone) {
    return NextResponse.json(
      { error: `Enter a valid ${country.name} phone number` },
      { status: 400 },
    );
  }

  if (kycValue) {
    const kyc = validateKyc(kycValue, country.code);
    if (!kyc.ok) return NextResponse.json({ error: kyc.error }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await supabase
    .from("users")
    .select("id")
    .eq("phone", normalisedPhone)
    .maybeSingle();

  if (existingErr) {
    console.error("[register] phone lookup failed", existingErr.message);
    return NextResponse.json(
      { error: "We could not create your account just now. Please try again in a moment." },
      { status: 503 },
    );
  }
  if (existing) {
    return NextResponse.json({ error: "That phone number already has an account" }, { status: 409 });
  }

  // The referral code attributes the player to a partner permanently. Only an
  // approved partner's code opens an account; anything else is refused.
  const partner = await approvedPartner(supabase, code);
  if (partner === "unavailable") {
    return NextResponse.json({ error: CODE_CHECK_DOWN }, { status: 503 });
  }
  if (!partner) {
    return NextResponse.json({ error: "That referral code is not valid" }, { status: 400 });
  }
  const referredBy: string = partner.id;

  const passwordHash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from("users")
    .insert({
      name: name.trim(),
      phone: normalisedPhone,
      email: email?.trim().toLowerCase() || null,
      password_hash: passwordHash,
      country_code: country.code,
      currency: country.currency,
      kyc_value: kycValue?.trim().toUpperCase() || null,
      referred_by: referredBy,
    })
    .select("id, name, phone, email, country_code, currency, balance")
    .single();

  if (error || !user) {
    console.error("[register] failed", error);
    return NextResponse.json({ error: "Could not create your account" }, { status: 500 });
  }

  return NextResponse.json({ user });
}
