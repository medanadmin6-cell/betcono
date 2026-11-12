"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Shield } from "lucide-react";
import { WalletPanel } from "@/components/partner/WalletPanel";
import { copyText } from "@/lib/clipboard";
import { formatMoney, getCountry } from "@/lib/countries";
import { OverviewCards } from "@/components/OverviewCards";
import type { OverviewStats } from "@/lib/overview";

interface Partner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  approved: boolean;
  user_id: string | null;
  balances: Record<string, number>;
  lifetime: Record<string, number>;
  payout_name: string | null;
  payout_network: string | null;
  payout_number: string | null;
}

interface Wallet {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  country_code: string;
  currency: string;
  balance: number;
}

interface PlayerRow {
  id: string;
  name: string;
  phone: string;
  currency: string;
  total_deposited: number;
  created_at: string;
  /** Deposit attempts: confirmed, failed, and still open (abandoned or waiting). */
  transactions?: { total: number; succeeded: number; failed: number; pending: number; last: string | null };
}

interface Dashboard {
  partner: Partner;
  players: PlayerRow[];
  commissions: { id: string; deposit_amount: number; currency: string; rate: number; amount: number; created_at: string }[];
  wallet: Wallet | null;
  creditedToday: number;
  dailyLimit: number;
  depositMinimum: number | null;
  depositCurrency: string;
  depositFloor: number;
  depositCeiling: number;
  overview: OverviewStats | null;
  /** This partner's share of each deposit, as a fraction. */
  commissionRate?: number;
}

export default function PartnerPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [checked, setChecked] = useState(false);

  // Bumping the nonce re-runs the effect; that is how a sign-in or sign-out
  // refreshes the dashboard without the effect body calling setState directly.
  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/partner/dashboard");
        const json = res.ok ? await res.json() : null;
        if (alive) setData(json);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setChecked(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [nonce]);

  if (!checked) return null;

  if (!data) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10">
        <Link href="/" className="mb-8 flex justify-center">
          <Image src="/logo.svg" alt="Pep Stake" width={160} height={35} priority />
        </Link>

        <div className="mb-4 flex border-b border-[var(--line)]">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`-mb-px flex-1 border-b-2 py-2.5 text-[13px] font-black ${
                mode === m
                  ? "border-[var(--accent)] text-[var(--text-bright)]"
                  : "border-transparent text-[var(--text-muted)]"
              }`}
            >
              {m === "login" ? "Partner login" : "Become a partner"}
            </button>
          ))}
        </div>

        <PartnerAuth mode={mode} onDone={load} />
      </div>
    );
  }

  return <PartnerDashboard data={data} onReload={load} />;
}

function PartnerAuth({ mode, onDone }: { mode: "login" | "register"; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/partner/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed");
        return;
      }
      if (mode === "register") setMessage(json.message);
      else onDone();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "register" && (
        <>
          <Field label="Your name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
            />
          </Field>
        </>
      )}

      <Field label="Email">
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
          autoComplete="username"
          className={inputClass}
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={inputClass}
        />
      </Field>

      {error && <p className="rounded bg-[var(--lose-bg)] px-3 py-2 text-[12px] text-[var(--lose)]">{error}</p>}
      {message && <p className="rounded bg-[var(--win)]/15 px-3 py-2 text-[12px] text-[var(--win)]">{message}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)] disabled:opacity-50"
      >
        {busy ? "Working…" : mode === "login" ? "Sign in" : "Create partner account"}
      </button>

      {mode === "register" && (
        <p className="text-center text-[11px] text-[var(--text-faint)]">
          You earn 70% of every deposit your players make, not just their first.
        </p>
      )}
    </form>
  );
}

function PartnerDashboard({ data, onReload }: { data: Dashboard; onReload: () => void }) {
  const { partner, players, commissions, wallet, creditedToday, dailyLimit } = data;
  const depositCountry = getCountry(wallet?.country_code ?? "GH");
  const [minimum, setMinimum] = useState(
    data.depositMinimum != null ? Number(data.depositMinimum).toFixed(2) : Number(data.depositFloor).toFixed(2),
  );
  const [minimumNote, setMinimumNote] = useState<string | null>(null);
  const [minimumError, setMinimumError] = useState<string | null>(null);
  const [savingMinimum, setSavingMinimum] = useState(false);
  const [payout, setPayout] = useState({
    payout_name: partner.payout_name ?? "",
    payout_network: partner.payout_network ?? "",
    payout_number: partner.payout_number ?? "",
  });
  const [note, setNote] = useState<string | null>(null);

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/register?ref=${partner.referral_code}`
      : "";

  const saveMinimum = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMinimum(true);
    setMinimumNote(null);
    setMinimumError(null);
    try {
      const res = await fetch("/api/partner/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ min_deposit: Number(minimum), countryCode: depositCountry.code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMinimumError(json.error ?? "Could not save the deposit minimum");
        return;
      }
      setMinimumNote("Saved.");
      onReload();
    } catch {
      setMinimumError("Network problem. Try again.");
    } finally {
      setSavingMinimum(false);
    }
  };

  const savePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/partner/dashboard", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payout),
    });
    setNote(res.ok ? "Saved." : "Could not save.");
    if (res.ok) onReload();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 md:px-6">
      <header className="flex items-center justify-between">
        {/* Partners kept landing on the betting home page, logged out, from
            this logo. It stays on the dashboard and refreshes it instead. */}
        <button
          type="button"
          aria-label="Refresh dashboard"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            onReload();
          }}
        >
          <Image src="/logo.svg" alt="Pep Stake" width={130} height={29} />
        </button>
        <button
          onClick={async () => {
            await fetch("/api/partner/logout", { method: "POST" });
            onReload();
          }}
          className="text-[12px] font-semibold text-[var(--text-faint)]"
        >
          Log out
        </button>
      </header>

      <section className="rounded-2xl bg-[#07111f] p-3 text-white">
        <h2 className="px-1 pb-2 text-[18px] font-black">Overview</h2>
        {data.overview ? (
          <OverviewCards stats={data.overview} rate={data.commissionRate ?? 0.7} />
        ) : (
          <p className="px-1 text-[13px] text-white/50">Overview is unavailable right now.</p>
        )}
      </section>

      {!partner.approved && (
        <p className="rounded-md border border-[var(--pending)] bg-[var(--pending)]/10 px-4 py-3 text-[12px] text-[var(--text)]">
          Your account is waiting for operator approval. You can sign in, but commission is not paid
          on deposits until you are approved.
        </p>
      )}

      {partner.approved ? (
        <Link
          href="/admin/custom-matches"
          className="flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3 hover:border-[var(--accent)]"
        >
          <span>
            <span className="block text-[13px] font-black text-[var(--text-bright)]">Custom matches</span>
            <span className="block text-[11px] text-[var(--text-faint)]">
              Create and manage house fixtures
            </span>
          </span>
          <span className="text-[12px] font-black text-[var(--accent)]">Open</span>
        </Link>
      ) : (
        <div className="flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3 opacity-60">
          <span>
            <span className="block text-[13px] font-black text-[var(--text-bright)]">Custom matches</span>
            <span className="block text-[11px] text-[var(--text-faint)]">
              Create and manage house fixtures
            </span>
          </span>
          <span className="text-[11px] font-bold text-[var(--text-faint)]">After approval</span>
        </div>
      )}

      <section className="rounded-md bg-[var(--chrome)] p-4 text-white">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">Your referral code</p>
        <p className="text-[28px] font-black tracking-[0.15em] text-[#9ff611]">
          {partner.referral_code}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-white/10 px-2 py-1.5 text-[11px] text-white/80">
            {link}
          </code>
          <button
            onClick={() => void copyText(link)}
            className="rounded bg-[#9ff611] px-3 py-1.5 text-[11px] font-black text-[#071a33]"
          >
            Copy
          </button>
        </div>
        <p className="mt-3 text-[12px] text-white/70">
          Your commission:{" "}
          <strong className="text-[15px] text-[#9ff611]">
            {Math.round((data.commissionRate ?? 0.7) * 10000) / 100}%
          </strong>{" "}
          of every deposit your players make.
        </p>
      </section>

      <form
        onSubmit={saveMinimum}
        className="rounded-2xl border border-white/10 bg-[#14120f] p-4 text-white"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#e0b15a]">
            Minimum deposit
          </p>
          <span className="rounded-full border border-[#e0b15a] px-2.5 py-1 text-[11px] font-bold text-[#e0b15a]">
            {formatMoney(Number(data.depositMinimum ?? data.depositFloor), data.depositCurrency)}
          </span>
        </div>
        <h2 className="mt-2 text-[22px] font-black">Deposit Adjustment</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-white/55">
          The smallest deposit, first deposit included, for users registered through your
          referral link. Each withdrawal verification deposit must also be at least this much.
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-white/45">
            Minimum deposit ({data.depositCurrency})
          </span>
          <input
            inputMode="decimal"
            value={minimum}
            onChange={(e) => setMinimum(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-[16px] text-white outline-none focus:border-[#e0b15a]"
          />
        </label>
        <button
          type="submit"
          disabled={savingMinimum}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-3 text-[14px] font-bold text-white disabled:opacity-50"
        >
          <Shield size={16} strokeWidth={2} />
          {savingMinimum ? "Saving…" : "Save Deposit Minimum"}
        </button>
        {minimumNote && <p className="mt-2 text-[12px] text-[#9ff611]">{minimumNote}</p>}
        {minimumError && <p className="mt-2 text-[12px] text-[#ff8d8d]">{minimumError}</p>}
      </form>

      <WalletPanel
        wallet={wallet}
        approved={partner.approved}
        defaultPhone={partner.phone}
        creditedToday={creditedToday}
        dailyLimit={dailyLimit}
        onChanged={onReload}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Referred players" value={String(players.length)} />
        <Card label="Owed to you" value={<Money totals={partner.balances} />} />
        <Card label="Earned all time" value={<Money totals={partner.lifetime} />} />
      </div>

      <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
        <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-black text-[var(--text-bright)]">
          Where to pay you
        </h2>
        <form onSubmit={savePayout} className="grid gap-2 p-4 sm:grid-cols-3">
          <input
            placeholder="Account name"
            value={payout.payout_name}
            onChange={(e) => setPayout({ ...payout, payout_name: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="Network or bank"
            value={payout.payout_network}
            onChange={(e) => setPayout({ ...payout, payout_network: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="Number"
            value={payout.payout_number}
            onChange={(e) => setPayout({ ...payout, payout_number: e.target.value })}
            className={inputClass}
          />
          <button
            type="submit"
            className="rounded bg-[var(--accent)] py-2.5 text-[13px] font-black text-[var(--accent-ink)] sm:col-span-3"
          >
            Save payout details
          </button>
          {note && <p className="text-[11px] text-[var(--text-muted)] sm:col-span-3">{note}</p>}
        </form>
      </section>

      <PlayersList players={players} />

      <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
        <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[13px] font-black text-[var(--text-bright)]">
          Commission history
        </h2>
        {!commissions.length ? (
          <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {commissions.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-[12px]">
                    Deposit {c.currency} {Number(c.deposit_amount).toFixed(2)}
                  </p>
                  <p className="text-[11px] text-[var(--text-faint)]">
                    {new Date(c.created_at).toLocaleString()} · {(Number(c.rate) * 100).toFixed(0)}%
                  </p>
                </div>
                <p className="text-[13px] font-bold text-[var(--accent)]">
                  +{c.currency} {Number(c.amount).toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A player who tried to pay but has nothing confirmed: worth a call. */
function isStruggling(p: PlayerRow): boolean {
  const t = p.transactions;
  return Boolean(t && t.total > 0 && t.succeeded === 0);
}

const PLAYER_FILTERS = [
  { key: "all", label: "All" },
  { key: "struggling", label: "Tried, not paid" },
  { key: "failed", label: "Has failed" },
  { key: "none", label: "No attempts" },
] as const;

function PlayersList({ players }: { players: PlayerRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof PLAYER_FILTERS)[number]["key"]>("all");

  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const shown = players.filter((p) => {
    if (q) {
      const nameHit = p.name.toLowerCase().includes(q);
      // "0544…" and "233544…" should both find the same player.
      const phoneHit = digits.length >= 3 && p.phone.includes(digits.replace(/^0/, ""));
      if (!nameHit && !phoneHit) return false;
    }
    const t = p.transactions;
    if (filter === "struggling") return isStruggling(p);
    if (filter === "failed") return Boolean(t && t.failed > 0);
    if (filter === "none") return !t || t.total === 0;
    return true;
  });

  const strugglingCount = players.filter(isStruggling).length;

  return (
    <section className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
      <div className="space-y-2 border-b border-[var(--line)] px-4 py-2.5">
        <h2 className="text-[13px] font-black text-[var(--text-bright)]">
          Your players ({players.length})
        </h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone number"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className="rounded px-2.5 py-1 text-[11px] font-bold"
              style={
                filter === f.key
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : { background: "var(--surface-2)", color: "var(--text-muted)" }
              }
            >
              {f.label}
              {f.key === "struggling" && strugglingCount > 0 ? ` (${strugglingCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {!players.length ? (
        <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">
          No one has signed up with your code yet.
        </p>
      ) : !shown.length ? (
        <p className="p-8 text-center text-[13px] text-[var(--text-muted)]">No players match.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {shown.map((p) => {
            const t = p.transactions ?? { total: 0, succeeded: 0, failed: 0, pending: 0, last: null };
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{p.name}</p>
                  <p className="text-[11px] text-[var(--text-faint)]">{p.phone}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {t.total === 0 ? (
                      "No deposit attempts"
                    ) : (
                      <>
                        Transactions {t.total}
                        {t.succeeded > 0 && <span className="text-[var(--win)]"> · {t.succeeded} paid</span>}
                        {t.failed > 0 && <span className="text-[var(--lose)]"> · {t.failed} failed</span>}
                        {t.pending > 0 && <span> · {t.pending} not finished</span>}
                        {t.last && <> · last {new Date(t.last).toLocaleDateString()}</>}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-[13px] font-black text-[var(--text-bright)]">
                    {p.currency} {Number(p.total_deposited).toFixed(2)}
                  </p>
                  <a
                    href={`tel:+${p.phone.replace(/\D/g, "")}`}
                    className="rounded px-2.5 py-1 text-[11px] font-bold"
                    style={
                      isStruggling(p)
                        ? { background: "var(--accent)", color: "var(--accent-ink)" }
                        : { background: "var(--surface-2)", color: "var(--text)" }
                    }
                  >
                    Call
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const inputClass =
  "w-full rounded border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[13px] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:border-[var(--accent)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      <div className="mt-0.5 text-[18px] font-black tabular-nums text-[var(--text-bright)]">{value}</div>
    </div>
  );
}

function Money({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals ?? {}).filter(([, v]) => v);
  if (!entries.length) return <span className="text-[var(--text-faint)]">-</span>;
  return (
    <>
      {entries.map(([currency, amount]) => (
        <p key={currency}>
          {currency} {Number(amount).toFixed(2)}
        </p>
      ))}
    </>
  );
}
