"use client";

import { useState } from "react";
import { useAdminData, adminAction, Panel, Table, Badge, Button } from "@/components/admin/ui";

interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  approved: boolean;
  referredPlayers: number;
  customRate: number | null;
  rate: number;
}

interface Data {
  partners: Partner[];
  defaultRate: number;
  canSetRate: boolean;
}

const pct = (rate: number) => `${Math.round(rate * 10000) / 100}%`;

/**
 * Commission % center: set each partner's share of their players' deposits.
 * A new rate applies to deposits from now on; commission already paid keeps
 * the rate it was paid at.
 */
export default function CommissionPage() {
  const { data, error, reload, busy } = useAdminData<Data>("/api/admin/sub-admins");
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const save = async (p: Partner, percent: number | null) => {
    const label = percent === null ? `the default ${pct(data?.defaultRate ?? 0.7)}` : `${percent}%`;
    if (!confirm(`Set ${p.name}'s commission to ${label}? It applies to deposits from now on.`)) return;
    const res = await adminAction("/api/admin/sub-admins", "PATCH", { id: p.id, action: "rate", percent });
    setNote(res.ok ? `${p.name} now earns ${pct(Number(res.data?.rate ?? 0))}.` : (res.error ?? "Failed"));
    if (res.ok) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[p.id];
        return next;
      });
      reload();
    }
  };

  const q = query.trim().toLowerCase();
  const rows = (data?.partners ?? []).filter((p) =>
    `${p.name} ${p.email} ${p.phone ?? ""} ${p.referral_code}`.toLowerCase().includes(q),
  );

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[18px] font-black text-[var(--text-bright)]">Commission %</h1>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">
          The share of every deposit each partner earns. Default is{" "}
          {data ? pct(data.defaultRate) : "70%"}. A change applies to deposits from now on.
        </p>
      </div>

      {data && !data.canSetRate && (
        <p className="rounded bg-[var(--lose)]/10 px-3 py-2 text-[12px] text-[var(--lose)]">
          Run migration 0017_partner_commission_rate.sql in the Supabase SQL editor to turn this on.
          Until then every partner earns the default.
        </p>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, phone or code"
        className="w-full rounded border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] outline-none"
      />

      {note && <p className="text-[12px] text-[var(--text-muted)]">{note}</p>}
      {error && <p className="text-[13px] text-[var(--lose)]">{error}</p>}

      <Panel title={`Partners${data ? ` (${rows.length})` : ""}`}>
        {busy && !data ? (
          <p className="p-6 text-[13px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <Table head={["Partner", "Players", "Current", "New %", ""]}>
            {rows.map((p) => {
              const draft = drafts[p.id] ?? "";
              const n = Number(draft);
              const valid = draft !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      <span className="font-mono font-bold text-[var(--accent)]">{p.referral_code}</span>
                      {p.phone ? ` · ${p.phone}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 font-bold tabular-nums">{p.referredPlayers}</td>
                  <td className="px-3 py-2">
                    <p className="text-[15px] font-black tabular-nums text-[var(--accent)]">{pct(p.rate)}</p>
                    {p.customRate === null ? (
                      <Badge tone="muted">Default</Badge>
                    ) : (
                      <Badge tone="win">Custom</Badge>
                    )}
                    {!p.approved && <p className="mt-0.5 text-[10px] text-[var(--lose)]">Not approved, earns nothing</p>}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.5}
                      value={draft}
                      disabled={!data?.canSetRate}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      placeholder={String(Math.round(p.rate * 10000) / 100)}
                      className="w-20 rounded border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-[13px] tabular-nums outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button tone="accent" disabled={!valid || !data?.canSetRate} onClick={() => save(p, n)}>
                        Save
                      </Button>
                      {p.customRate !== null && (
                        <Button disabled={!data?.canSetRate} onClick={() => save(p, null)}>
                          Reset
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </div>
  );
}
