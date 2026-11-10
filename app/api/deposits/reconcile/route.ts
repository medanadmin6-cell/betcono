import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { reconcilePendingDeposits } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

/**
 * Sweep up deposits that settled while the player was away.
 *
 * Hosted checkouts are unreliable in exactly one way: the player closes the tab
 * before the redirect fires. The account screen calls this on load, and because
 * credits are idempotent it is safe to call as often as it likes.
 */
export async function POST(req: Request) {
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { credited } = await reconcilePendingDeposits(supabase, {
    userIds: [body.userId],
    sinceHours: 24,
    max: 20,
  });
  return NextResponse.json({ credited });
}
