import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { adminRole } from "@/lib/admin-guard";
import { currentPartner } from "@/lib/partner";
import { loadOverview } from "@/lib/overview";
import { syncPartnerTotals, syncAllPartnerTotals } from "@/lib/partner-totals";

export const dynamic = "force-dynamic";

/** Overview totals. An operator sees the whole book. A sub-admin sees only their referrals. */
export async function GET() {
  const role = await adminRole();
  if (!role) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const partner = role === "sub" ? await currentPartner() : null;
  if (role === "sub" && !partner) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Rebuild owed/lifetime from the commission rows before the cards read them.
  await (partner ? syncPartnerTotals(supabase, partner.id) : syncAllPartnerTotals(supabase)).catch((err) =>
    console.error("[overview] totals sync failed", err),
  );
  const overview = await loadOverview(supabase, partner?.id ?? null);
  return NextResponse.json({ ...overview, scope: partner ? "referral" : "book" });
}
