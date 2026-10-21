import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/** The full ledger of deposits and withdrawals across every rail. */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");

  let query = supabase
    .from("payments")
    .select("reference, amount, currency, provider, status, metadata, created_at, resolved_at, users!inner(id, name, phone)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (status && status !== "all") query = query.eq("status", status);
  if (type && type !== "all") query = query.eq("metadata->>type", type);

  const { data } = await query;
  return NextResponse.json({ payments: data ?? [] });
}

/** Statuses that mean the money never left, so the player gets it back. */
const REFUNDING = new Set(["failed", "cancelled", "rejected"]);

/**
 * Mark a withdrawal resolved once the operator has paid it out by hand — or
 * turn it down, which has to give the money back.
 *
 * A withdrawal debits the balance when the player asks for it, so a request
 * that is refused and merely restamped would keep their money. The refund
 * rides on the status transition itself: only the call that actually moves the
 * row out of pending credits anything, so pressing the button twice cannot pay
 * twice.
 */
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  if (!body?.reference || !body?.status) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: claimed } = await supabase
    .from("payments")
    .update({ status: body.status, resolved_at: new Date().toISOString() })
    .eq("reference", body.reference)
    .eq("status", "pending")
    .select("user_id, amount, metadata")
    .maybeSingle();

  if (!claimed) {
    // Already resolved by someone else, or never pending. Leave it alone.
    return NextResponse.json({ ok: true, refunded: false });
  }

  const meta = (claimed.metadata ?? {}) as { type?: string };
  if (meta.type !== "withdrawal" || !REFUNDING.has(String(body.status))) {
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
    })
    .eq("id", claimed.user_id);

  if (error) {
    console.error("[withdrawal] REFUND FAILED, owed to player", claimed.user_id, amount, error);
    return NextResponse.json({ error: "Marked, but the refund failed" }, { status: 500 });
  }

  console.info("[withdrawal] refunded", { reference: body.reference, user: claimed.user_id, amount });
  return NextResponse.json({ ok: true, refunded: true, amount });
}
