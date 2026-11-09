import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/**
 * Withdrawals only. Split out of /api/admin/payments so the withdrawals screen
 * has its own endpoint; the old payments route is left in place and still works.
 */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const status = new URL(req.url).searchParams.get("status");

  let query = supabase
    .from("payments")
    .select("reference, amount, currency, provider, status, metadata, created_at, resolved_at, users!inner(id, name, phone)")
    .eq("metadata->>type", "withdrawal")
    .order("created_at", { ascending: false })
    .limit(300);

  if (status && status !== "all") query = query.eq("status", status);

  const { data } = await query;
  return NextResponse.json({ withdrawals: data ?? [] });
}

/** Statuses that mean the money never left, so the player gets it back. */
const REFUNDING = new Set(["failed", "cancelled", "rejected"]);
const ALLOWED = new Set(["resolved", ...REFUNDING]);

/**
 * Mark a withdrawal paid, or turn it down and refund the player.
 *
 * The balance is debited when the player asks, so a refusal must credit it
 * back. The refund rides on the pending -> resolved transition: only the call
 * that actually moves the row out of pending credits anything, so pressing the
 * button twice cannot pay twice.
 */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.reference || !ALLOWED.has(String(body?.status))) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: claimed } = await supabase
    .from("payments")
    .update({ status: body.status, resolved_at: new Date().toISOString() })
    .eq("reference", body.reference)
    .eq("status", "pending")
    .eq("metadata->>type", "withdrawal")
    .select("user_id, amount")
    .maybeSingle();

  if (!claimed) {
    // Already resolved, never pending, or not a withdrawal. Leave it alone.
    return NextResponse.json({ ok: true, refunded: false });
  }

  if (!REFUNDING.has(String(body.status))) {
    return NextResponse.json({ ok: true, refunded: false });
  }

  const { data: user } = await supabase
    .from("users")
    .select("balance, total_withdrawn")
    .eq("id", claimed.user_id)
    .maybeSingle();

  if (!user) {
    console.error("[withdrawal] refund has no player", claimed.user_id, body.reference);
    return NextResponse.json({ ok: true, refunded: false });
  }

  const amount = Number(claimed.amount);
  const { error } = await supabase
    .from("users")
    .update({
      balance: Number(user.balance) + amount,
      total_withdrawn: Math.max(0, Number(user.total_withdrawn) - amount),
      qualifying_deposits: 0,
      withdrawal_approved: false,
    })
    .eq("id", claimed.user_id);

  if (error) {
    console.error("[withdrawal] REFUND FAILED, owed to player", claimed.user_id, amount, error);
    return NextResponse.json({ error: "Marked, but the refund failed" }, { status: 500 });
  }

  console.info("[withdrawal] refunded", { reference: body.reference, user: claimed.user_id, amount });
  return NextResponse.json({ ok: true, refunded: true, amount });
}
