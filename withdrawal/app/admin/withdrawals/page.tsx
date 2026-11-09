"use client";

import { useState } from "react";
import { useAdminData, adminAction, Badge, Button, money } from "@/components/admin/ui";

interface Payment {
  reference: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  metadata: { type?: string; payout_number?: string; payout_bank?: string; awaiting_approval?: boolean };
  created_at: string;
  users: { id: string; name: string; phone: string };
}

const TONE: Record<string, "win" | "lose" | "pending" | "muted"> = {
  confirmed: "win",
  resolved: "win",
  failed: "lose",
  cancelled: "lose",
  rejected: "lose",
  pending: "pending",
};

const STATUSES = ["all", "pending", "confirmed", "resolved", "failed"];

export default function WithdrawalsPage() {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const { data, error, reload, busy } = useAdminData<{ withdrawals: Payment[] }>(
    `/api/admin/withdrawals?status=${status}`,
  );
  const [note, setNote] = useState<string | null>(null);

  const rows = (data?.withdrawals ?? []).filter((payment) => {
    const hay = `${payment.users?.name ?? ""} ${payment.users?.phone ?? ""} ${payment.reference}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  const markPaid = async (reference: string) => {
    const res = await adminAction("/api/admin/withdrawals", "PATCH", { reference, status: "resolved" });
    setNote(res.ok ? "Marked paid." : (res.error ?? "Failed"));
    if (res.ok) reload();
  };

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100vh-7.5rem)] bg-[#07111f] px-4 py-5 text-white">
      <div className="mx-auto max-w-lg space-y-3">
        <div>
          <h1 className="text-[22px] font-black">Withdrawals</h1>
          <p className="mt-1 text-[13px] text-white/60">Requests from players, with the real status.</p>
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by phone or reference"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0c1a30] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-white/35"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#0c1a30] px-2 py-2.5 text-[12px] font-bold capitalize text-white"
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {note && <p className="text-[12px] text-white/70">{note}</p>}
        {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c1a30]">
          <div className="grid grid-cols-[1.2fr_1fr_auto] gap-2 border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/40">
            <span>Amount</span>
            <span>Method</span>
            <span>Status</span>
          </div>
          {busy && !data ? (
            <p className="px-3 py-6 text-[13px] text-white/50">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-white/50">No withdrawals.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {rows.map((payment) => (
                <li key={payment.reference} className="grid grid-cols-[1.2fr_1fr_auto] items-center gap-2 px-3 py-3">
                  <div>
                    <p className="text-[13px] font-black tabular-nums">{money(payment.amount, payment.currency)}</p>
                    <p className="truncate text-[11px] text-white/55">{payment.users?.name ?? "Player"}</p>
                  </div>
                  <p className="truncate text-[12px] text-white/75">
                    {payment.metadata?.payout_bank || payment.provider || "—"}
                  </p>
                  <div className="text-right">
                    <Badge tone={TONE[payment.status] ?? "muted"}>{payment.status}</Badge>
                    {payment.status === "pending" && (
                      <Button tone="accent" className="mt-1" onClick={() => markPaid(payment.reference)}>
                        Mark paid
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
