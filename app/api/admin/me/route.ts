import { NextResponse } from "next/server";
import { adminRole } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/** The console tier of the current session, for the nav. Null means neither
 *  an operator cookie nor an approved partner session. */
export async function GET() {
  return NextResponse.json({ role: await adminRole() });
}
