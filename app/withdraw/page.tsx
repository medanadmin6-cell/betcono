"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";
import { getCountry, formatMoney } from "@/lib/countries";
import { VerifyGate } from "@/components/VerifyGate";
import { RequestSubmitted } from "@/components/RequestSubmitted";
import { showWithdrawalIos } from "@/lib/withdrawal-ios";

export default function WithdrawPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [amount, setAmount] = useState(0);
  const [payoutNumber, setPayoutNumber] = useState("");
  const [payoutBank, setPayoutBank] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ title: string; message: string } | null>(null);
  const [progress, setProgress] = useState<{ label: string; have: number; need: number } | null>(null);
  const [gateFailed, setGateFailed] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const country = player ? getCountry(player.country_code) : getCountry("GH");

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  const fetchMe = useCallback(async () => {
    if (!player) return null;
    try {
      const res = await fetch(`/api/me?userId=${player.id}`);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }, [player]);

  const apply = useCallback(
    (j: {
      withdrawal: { unlocked: boolean; failed?: string; progress: { label: string; have: number; need: number } };
      user: { payout_number?: string | null; payout_bank?: string | null; balance?: number };
    }) => {
      setProgress(j.withdrawal.progress);
      setGateFailed(j.withdrawal.unlocked ? null : (j.withdrawal.failed ?? null));
      setPayoutNumber((n) => n || j.user.payout_number || player?.phone || "");
      setPayoutBank((b) => b || j.user.payout_bank || "");
      if (typeof j.user.balance === "number") setBalance(Number(j.user.balance));
    },
    [player, setBalance],
  );

  useEffect(() => {
    let alive = true;
    void fetchMe().then((j) => {
      if (alive && j) apply(j);
    });
    return () => {
      alive = false;
    };
  }, [fetchMe, apply]);

  /** The player says they have deposited: ask the server rather than assume. */
  const recheck = () => {
    setChecking(true);
    void fetchMe().then((j) => {
      if (j) apply(j);
      setChecking(false);
    });
  };

  if (!player) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player.id, amount, payoutNumber, payoutBank }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Could not submit your withdrawal");
        if (json.progress) setProgress(json.progress);
        return;
      }

      // Awaiting an operator reads differently from already on its way, so the
      // heading follows the endpoint rather than assuming one of them.
      setSubmitted({
        title: json.status === "processing" ? "Request pending" : "Withdrawal sent",
        message: json.message,
      });
      if (typeof json.balance === "number") setBalance(json.balance);
      const paid = Number(json.amount);
      const left = Number(json.balance);
      if (
        json.notify === true &&
        (json.status === "submitted" || json.status === "processing") &&
        Number.isFinite(paid) &&
        paid > 0 &&
        Number.isFinite(left)
      ) {
        showWithdrawalIos({
          amount: paid,
          currentBalance: left,
          currency: typeof json.currency === "string" && json.currency ? json.currency : player.currency,
        });
      }
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      {/* The deposit gate is the one worth interrupting for: the others are
          fixed on this page, this one is not. */}
      {submitted && <RequestSubmitted title={submitted.title} message={submitted.message} />}

      {gateFailed === "deposits" && progress && (
        <VerifyGate
          amount={country.withdrawQualifyAmount}
          currency={player.currency}
          have={progress.have}
          need={progress.need}
          onBack={() => router.back()}
          onRecheck={recheck}
          checking={checking}
        />
      )}

      <div className="mx-auto max-w-lg space-y-3 px-4 py-5">
        <h1 className="text-[20px] font-black text-[var(--text-bright)]">Withdraw</h1>

        <div className="rounded-md bg-[var(--chrome)] p-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">Available to withdraw</p>
          <p className="mt-0.5 text-[28px] font-black tabular-nums text-[#9ff611]">
            {formatMoney(Number(player.balance), player.currency)}
          </p>
          {progress && (
            <div className="mt-2">
              <p className="text-[11px] text-white/70">{progress.label}</p>
              {progress.need > 0 && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full bg-[#9ff611]"
                    style={{ width: `${Math.min(100, (progress.have / progress.need) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-4"
        >
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">
              Amount ({country.currency})
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[18px] font-black tabular-nums text-[var(--input-ink)] outline-none focus:border-[var(--accent)]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">
              {country.payoutRail === "mobile" ? "Mobile money number" : "Account number"}
            </span>
            <input
              value={payoutNumber}
              onChange={(e) => setPayoutNumber(e.target.value)}
              className="w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[14px] tabular-nums text-[var(--input-ink)] outline-none focus:border-[var(--accent)]"
            />
          </label>

          {country.payoutRail === "bank" && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">Bank</span>
              <input
                value={payoutBank}
                onChange={(e) => setPayoutBank(e.target.value)}
                className="w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[14px] text-[var(--input-ink)] outline-none focus:border-[var(--accent)]"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={busy || amount <= 0}
            className="w-full rounded-[5px] bg-[var(--accent)] py-3 text-[15px] font-black text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Request withdrawal"}
          </button>
        </form>

        {message && (
          <p className="rounded bg-[var(--win)]/15 px-3 py-2.5 text-[12px] text-[var(--win)]">{message}</p>
        )}
        {error && (
          <p className="rounded bg-[var(--lose-bg)] px-3 py-2.5 text-[12px] text-[var(--lose)]">{error}</p>
        )}
      </div>
    </Page>
  );
}
