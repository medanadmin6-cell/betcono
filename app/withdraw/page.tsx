"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";
import { getCountry, formatMoney } from "@/lib/countries";
import { VerifyGate } from "@/components/VerifyGate";
import { RequestSubmitted } from "@/components/RequestSubmitted";
import { showWithdrawalIos } from "@/lib/withdrawal-ios";

interface WithdrawalProgress {
  label: string;
  have: number;
  need: number;
}

interface MeResponse {
  withdrawal: {
    unlocked: boolean;
    failed?: string;
    progress: WithdrawalProgress;
    hasWon?: boolean;
    qualifyAmount?: number;
  };
  user: {
    payout_number?: string | null;
    payout_bank?: string | null;
    balance?: number;
  };
}

interface Submission {
  title: string;
  message: string;
  reference?: string;
  statusCheckAt?: string;
  /** 0 when this request is never auto-refunded (sub-admin accounts). */
  refundMinutes: number;
}

export default function WithdrawPage() {
  const router = useRouter();

  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [amount, setAmount] = useState(0);
  const [payoutNumber, setPayoutNumber] = useState("");
  const [payoutBank, setPayoutBank] = useState("");

  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [submitted, setSubmitted] =
    useState<Submission | null>(null);

  const [progress, setProgress] =
    useState<WithdrawalProgress | null>(null);

  const [gateFailed, setGateFailed] =
    useState<string | null>(null);
  const [gateReady, setGateReady] = useState(false);
  // Set by the server from the partner's deposit adjustment.
  const [qualifyAmount, setQualifyAmount] = useState<number | null>(null);

  const country = player
    ? getCountry(player.country_code)
    : getCountry("GH");

  // Redirect unauthenticated players.
  useEffect(() => {
    if (hydrated && !player) {
      router.replace("/login");
    }
  }, [hydrated, player, router]);

  // Load the latest player information.
  const fetchMe = useCallback(async () => {
    if (!player) return null;

    try {
      const res = await fetch(
        `/api/me?userId=${encodeURIComponent(player.id)}`,
        {
          cache: "no-store",
        }
      );

      if (!res.ok) return null;

      return (await res.json()) as MeResponse;
    } catch {
      return null;
    }
  }, [player]);

  // Apply server information.
  const apply = useCallback(
    (j: MeResponse) => {
      setProgress(j.withdrawal.progress);
      if (typeof j.withdrawal.qualifyAmount === "number") {
        setQualifyAmount(j.withdrawal.qualifyAmount);
      }

      setGateFailed(
        j.withdrawal.unlocked
          ? null
          : j.withdrawal.failed ?? null
      );
      setGateReady(true);

      setPayoutNumber(
        (n) =>
          n ||
          j.user.payout_number ||
          player?.phone ||
          ""
      );

      setPayoutBank(
        (b) => b || j.user.payout_bank || ""
      );

      if (typeof j.user.balance === "number") {
        setBalance(j.user.balance);
      }
    },
    [player, setBalance]
  );

  useEffect(() => {
    let alive = true;

    void fetchMe().then((j) => {
      if (!alive) return;
      if (j) apply(j);
      else setGateReady(true);
    });

    return () => {
      alive = false;
    };
  }, [fetchMe, apply]);

  // Recheck deposit qualification with the server.
  const recheck = async () => {
    setChecking(true);
    setError(null);

    try {
      const j = await fetchMe();

      if (j) {
        apply(j);
      } else {
        setError("Could not refresh your account. Try again.");
      }
    } finally {
      setChecking(false);
    }
  };

  if (!player) return null;

  // Submit withdrawal.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (busy) return;
    if (gateFailed === "deposits") {
      setError("Complete withdrawal verification before you can withdraw.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    setSubmitted(null);

    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: player.id,
          amount,
          payoutNumber,
          payoutBank,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(
          json.error ?? "Could not submit your withdrawal"
        );

        if (json.progress) {
          setProgress(json.progress);
        }

        if (json.gate) {
          setGateFailed(json.gate);
        }

        return;
      }

      const isProcessing =
        json.status === "processing";

      setSubmitted({
        title: isProcessing
          ? "Withdrawal request received"
          : "Withdrawal submitted",
        message: json.message,
        reference: json.reference,
        statusCheckAt: json.statusCheckAt,
        refundMinutes: Number(json.refundMinutes) || 0,
      });

      if (typeof json.balance === "number") {
        setBalance(json.balance);
      }

      setAmount(0);

      // Show the existing notification for eligible
      // administrative accounts.
      const paid = Number(json.amount);
      const left = Number(json.balance);

      if (
        json.notify === true &&
        ["submitted", "processing"].includes(json.status) &&
        Number.isFinite(paid) &&
        paid > 0 &&
        Number.isFinite(left)
      ) {
        showWithdrawalIos({
          amount: paid,
          currentBalance: left,
          currency:
            typeof json.currency === "string" &&
            json.currency
              ? json.currency
              : player.currency,
        });
      }

      // Refresh the account from the backend.
      const latest = await fetchMe();

      if (latest) {
        apply(latest);
      }
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const progressPercent =
    progress && progress.need > 0
      ? Math.min(
          100,
          (progress.have / progress.need) * 100
        )
      : 0;

  const showDeposits = gateFailed === "deposits";

  return (
    <Page>
      {submitted && (
        <RequestSubmitted
          title={submitted.title}
          message={submitted.message}
        />
      )}

      {submitted && (
        <div className="mx-auto max-w-lg px-4">
          <div className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-3 space-y-2">
            {submitted.reference && (
              <p className="text-[12px] text-[var(--text-muted)]">
                Reference:{" "}
                <strong>{submitted.reference}</strong>
              </p>
            )}

            {submitted.refundMinutes > 0 && submitted.statusCheckAt && (
              <p className="text-[12px] text-[var(--text-muted)]">
                If not paid by:{" "}
                <strong>
                  {new Date(
                    submitted.statusCheckAt
                  ).toLocaleString()}
                </strong>
              </p>
            )}

            {submitted.refundMinutes > 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">
                If your withdrawal is not paid within{" "}
                {submitted.refundMinutes} minutes, the full
                amount goes back to your wallet automatically,
                and you will need to complete the deposit
                verification again before your next withdrawal.
              </p>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">
                The amount has been deducted from your wallet
                and will be paid out by the operator.
              </p>
            )}
          </div>
        </div>
      )}

      {showDeposits && progress && (
        <VerifyGate
          amount={qualifyAmount ?? country.withdrawQualifyAmount}
          currency={player.currency}
          have={progress.have}
          need={progress.need}
          onBack={() => router.back()}
          onRecheck={recheck}
          checking={checking}
        />
      )}

      <div className="mx-auto max-w-lg space-y-3 px-4 py-5">
        <h1 className="text-[20px] font-black text-[var(--text-bright)]">
          Withdraw
        </h1>

        <div className="rounded-md bg-[var(--chrome)] p-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">
            Available to withdraw
          </p>

          <p className="mt-0.5 text-[28px] font-black tabular-nums text-[#9ff611]">
            {formatMoney(
              Number(player.balance),
              player.currency
            )}
          </p>

          {showDeposits && progress && (
            <div className="mt-2">
              <p className="text-[11px] text-white/70">
                {progress.label}
              </p>

              {progress.need > 0 && (
                <>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full bg-[#9ff611] transition-all"
                      style={{
                        width: `${progressPercent}%`,
                      }}
                    />
                  </div>

                  <p className="mt-1 text-[10px] text-white/60">
                    {Math.max(
                      0,
                      progress.need - progress.have
                    )}{" "}
                    qualifying deposits remaining
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* The form stays closed until a winning player finishes both
            qualifying deposits. A player who has never won sees it open. */}
        {gateReady && !showDeposits && (
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
              min={country.minWithdraw || 1}
              max={
                country.maxWithdraw > 0
                  ? Math.min(country.maxWithdraw, Number(player.balance))
                  : Number(player.balance)
              }
              step="0.01"
              value={amount || ""}
              onChange={(e) =>
                setAmount(Number(e.target.value))
              }
              className="w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[18px] font-black tabular-nums text-[var(--input-ink)] outline-none focus:border-[var(--accent)]"
              required
            />

            {(country.minWithdraw > 0 || country.maxWithdraw > 0) && (
              <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                {country.minWithdraw > 0 && `Min ${formatMoney(country.minWithdraw, player.currency)}`}
                {country.minWithdraw > 0 && country.maxWithdraw > 0 && " · "}
                {country.maxWithdraw > 0 && `Max ${formatMoney(country.maxWithdraw, player.currency)}`}
                {" per withdrawal"}
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">
              {country.payoutRail === "mobile"
                ? "Mobile money number"
                : "Account number"}
            </span>

            <input
              value={payoutNumber}
              onChange={(e) =>
                setPayoutNumber(e.target.value)
              }
              required
              className="w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[14px] tabular-nums text-[var(--input-ink)] outline-none focus:border-[var(--accent)]"
            />
          </label>

          {country.payoutRail === "bank" && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">
                Bank
              </span>

              <input
                value={payoutBank}
                onChange={(e) =>
                  setPayoutBank(e.target.value)
                }
                required
                className="w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[14px] text-[var(--input-ink)] outline-none focus:border-[var(--accent)]"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={
              busy ||
              amount <= 0 ||
              amount > Number(player.balance) ||
              (country.minWithdraw > 0 && amount < country.minWithdraw) ||
              (country.maxWithdraw > 0 && amount > country.maxWithdraw)
            }
            className="w-full rounded-[5px] bg-[var(--accent)] py-3 text-[15px] font-black text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy
              ? "Submitting…"
              : "Request withdrawal"}
          </button>
        </form>
        )}

        {showDeposits && (
          <button
            type="button"
            onClick={recheck}
            disabled={checking}
            className="w-full rounded-[5px] border border-[var(--line)] py-2.5 text-[13px] font-bold text-[var(--text-bright)] disabled:opacity-50"
          >
            {checking
              ? "Checking account…"
              : "Refresh deposit progress"}
          </button>
        )}

        {message && (
          <p className="rounded bg-[var(--win)]/15 px-3 py-2.5 text-[12px] text-[var(--win)]">
            {message}
          </p>
        )}

        {error && (
          <p className="rounded bg-[var(--lose-bg)] px-3 py-2.5 text-[12px] text-[var(--lose)]">
            {error}
          </p>
        )}
      </div>
    </Page>
  );
}
