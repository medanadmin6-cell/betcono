import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { platformSupport } from "@/lib/platform-support";

export const dynamic = "force-dynamic";

/** Public support lines. Partner numbers, when a player has them, replace these. */
export async function GET() {
  const supabase = db();
  if (!supabase) return NextResponse.json({ phone: null, whatsapp: null });
  return NextResponse.json(await platformSupport(supabase));
}
