import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";
import { platformSupport } from "@/lib/platform-support";
import { supportDigits } from "@/lib/support-numbers";

export const dynamic = "force-dynamic";

/** The operator's support lines, shown to players whose partner has not set their own. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["support_phone", "support_whatsapp"]);
  const stored = new Map((data ?? []).map((row) => [row.key, row.value as string | null]));
  return NextResponse.json({
    phone: stored.has("support_phone") ? supportDigits(stored.get("support_phone")) : "",
    whatsapp: stored.has("support_whatsapp") ? supportDigits(stored.get("support_whatsapp")) : "",
  });
}

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const rows: { key: string; value: string }[] = [];
  if (body.support_phone !== undefined) {
    const digits = supportDigits(body.support_phone);
    if (String(body.support_phone).trim() && !digits) {
      return NextResponse.json({ error: "Enter a phone number with 8 to 15 digits" }, { status: 400 });
    }
    rows.push({ key: "support_phone", value: digits ?? "" });
  }
  if (body.support_whatsapp !== undefined) {
    const digits = supportDigits(body.support_whatsapp);
    if (String(body.support_whatsapp).trim() && !digits) {
      return NextResponse.json({ error: "Enter a WhatsApp number with 8 to 15 digits" }, { status: 400 });
    }
    rows.push({ key: "support_whatsapp", value: digits ?? "" });
  }
  if (!rows.length) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) {
    console.error("[admin] could not save support numbers", error);
    return NextResponse.json({ error: "Could not save the support numbers" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(await platformSupport(supabase)) });
}
