
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, HelpCircle, Shield } from "lucide-react";
import { useSession } from "@/lib/store";
import { getCountry } from "@/lib/countries";
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
  };
  user: {
    phone?: string | null;
    payout_number?: string | null;
    payout_bank?: string | null;
    balance?: number;
    qualifying_deposits?: number;
  };
}

interface PaidDeposit {
  reference: string;
  amount: number;
}

interface Submission {
  title: string;
  message: string;
  reference?: string;
  statusCheckAt?: string;
}

export default function WithdrawPage() {
  const router = useRouter();

  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [amount, setAmount] = useState(0);
  const [payoutNumber, setPayoutNumber] = useState("");
  const [payoutBank, setPayoutBank] = useState("");
  const [network, setNetwork] = useState("");
  const [paidDeposits, setPaidDeposits] = useState<PaidDeposit[]>([]);
  const [editingPhone, setEditingPhone] = useState(false);

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
      setNetwork((current) => {
        if (current) return current;
        const saved = j.user.payout_bank || "";
        if (country.networks.includes(saved)) return saved;
        return country.networks[0] || "";
      });

      if (typeof j.user.balance === "number") {
        setBalance(j.user.balance);
      }
    },
    [player, setBalance, country.networks]
  );

  const loadDeposits = useCallback(async () => {
    if (!player) return;
    try {
      const res = await fetch(`/api/transactions?userId=${encodeURIComponent(player.id)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      const floor = country.withdrawQualifyAmount;
      const rows: PaidDeposit[] = (json.transactions ?? [])
        .filter((tx: { status?: string; amount?: number; metadata?: { type?: string } }) => {
          return (
            tx.metadata?.type === "deposit" &&
            tx.status === "confirmed" &&
            Number(tx.amount) >= floor
          );
        })
        .map((tx: { reference: string; amount: number }) => ({
          reference: tx.reference,
          amount: Number(tx.amount),
        }))
        .reverse();
      setPaidDeposits(rows);
    } catch {
      /* the count from the account still draws the checklist */
    }
  }, [player, country.withdrawQualifyAmount]);

  useEffect(() => {
    let alive = true;

    void fetchMe().then((j) => {
      if (!alive) return;
      if (j) apply(j);
      else setGateReady(true);
    });
    void loadDeposits();

    return () => {
      alive = false;
    };
  }, [fetchMe, apply, loadDeposits]);

  // Recheck deposit qualification with the server.
  const recheck = async () => {
    setChecking(true);
    setError(null);

    try {
      const j = await fetchMe();

      if (j) {
        apply(j);
        await loadDeposits();
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
          payoutBank: country.payoutRail === "mobile" ? network : payoutBank,
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

  const countMode = country.withdrawQualifyCount > 0;
  const need = countMode ? progress?.need ?? country.withdrawQualifyCount : 0;
  const have = Math.min(progress?.have ?? 0, need || 0);
  const locked = gateFailed === "deposits";
  const steps = need > 0 ? Array.from({ length: need }, (_, i) => i) : [];
  const phoneShown = maskPhone(payoutNumber || player.phone || "");

  return (
    <div className="min-h-screen bg-[#f4f5f7] pb-10 text-[#1c1c1c]">
      <header className="sticky top-0 z-40 flex h-14 items-center bg-[#111] px-3 text-white">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="rounded p-1">
          <ArrowLeft size={22} strokeWidth={2.2} />
        </button>
        <h1 className="flex-1 text-center text-[17px] font-bold">Withdraw</h1>
        <Link href="/account" aria-label="Help" className="rounded p-1">
          <HelpCircle size={22} strokeWidth={2} />
        </Link>
      </header>

      <div className="mx-auto max-w-lg space-y-3 px-3 py-3">
        {submitted && (
          <RequestSubmitted title={submitted.title} message={submitted.message} />
        )}

        {locked && steps.length > 0 && (
          <section className="rounded-2xl border border-[#ececec] bg-white p-3.5 shadow-sm">
            <div className="flex items-start gap-2">
              <Shield size={20} className="mt-0.5 shrink-0 text-[#e0a100]" strokeWidth={2.4} fill="#e0a100" fillOpacity={0.18} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold">
                  Withdrawal deposits {have}/{need}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-[#6b6b6b]">
                  Make {need} qualifying deposit{need === 1 ? "" : "s"} of at least{" "}
                  {moneyCode(country.withdrawQualifyAmount, player.currency)} before you can withdraw.
                  Progress: {have}/{need}.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#111] px-2.5 py-1 text-[12px] font-bold text-white">
                {have}/{need}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {steps.map((index) => {
                const done = index < have;
                const current = index === have;
                const paid = paidDeposits[index];
                return (
                  <div
                    key={index}
                    className={`rounded-xl px-3 py-3 ${
                      done ? "bg-[#f3faf4]" : "bg-[#f6f7f8]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[14px] font-semibold">
                        Deposit {index + 1}/{need}
                      </p>
                      <p className={`text-[11px] font-bold tracking-wide ${done ? "text-[#1b9a4b]" : "text-[#9aa0a6]"}`}>
                        {done ? "DONE" : "REQUIRED"}
                      </p>
                    </div>
                    {done && paid && (
                      <p className="mt-1 text-[12px] text-[#6b8f78]">
                        {paid.reference} · {moneyCode(paid.amount, player.currency)}
                      </p>
                    )}
                    {current && (
                      <Link
                        href="/deposit"
                        className="mt-2.5 flex h-10 items-center justify-center rounded-full bg-[#111] px-4 text-[13px] font-bold text-white"
                      >
                        Deposit {moneyCode(country.withdrawQualifyAmount, player.currency)} (Deposit {index + 1}/{need})
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={recheck}
              disabled={checking}
              className="mt-3 text-[12px] font-bold text-[#6b6b6b] disabled:opacity-50"
            >
              {checking ? "Checking…" : "Refresh progress"}
            </button>
          </section>
        )}

        <form onSubmit={submit} className="space-y-3">
          <section className="rounded-2xl border border-[#ececec] bg-white p-3.5 shadow-sm">
            <h2 className="border-l-4 border-[#f5c400] pl-2 text-[15px] font-bold">Withdraw to</h2>
            <label className="mt-3 flex items-center justify-between rounded-full border border-[#e4e4e4] px-4 py-3">
              <span className="text-[14px] text-[#8a8a8a]">
                {country.payoutRail === "mobile" ? "Phone Number" : "Account number"}
              </span>
              <input
                value={editingPhone ? payoutNumber : phoneShown || payoutNumber}
                onChange={(e) => setPayoutNumber(e.target.value)}
                onFocus={() => setEditingPhone(true)}
                onBlur={() => setEditingPhone(false)}
                placeholder="Number"
                aria-label={country.payoutRail === "mobile" ? "Phone number" : "Account number"}
                className="w-36 bg-transparent text-right text-[15px] font-semibold outline-none"
                required
              />
            </label>

            {country.payoutRail === "mobile" ? (
              <label className="mt-2 flex items-center gap-2 rounded-full border border-[#e4e4e4] px-4 py-2.5">
                <span className="text-[14px] text-[#8a8a8a]">Operator</span>
                <span className="ml-auto rounded bg-[#f5c400] px-1.5 py-0.5 text-[10px] font-black">MoMo</span>
                <select
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                  className="max-w-[46%] appearance-none bg-transparent text-right text-[14px] font-semibold outline-none"
                >
                  {country.networks.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="text-[#666]" />
              </label>
            ) : (
              <label className="mt-2 flex items-center justify-between rounded-full border border-[#e4e4e4] px-4 py-3">
                <span className="text-[14px] text-[#8a8a8a]">Bank</span>
                <input
                  value={payoutBank}
                  onChange={(e) => setPayoutBank(e.target.value)}
                  className="w-40 bg-transparent text-right text-[15px] font-semibold outline-none"
                  required
                />
              </label>
            )}
          </section>

          <section className="rounded-2xl border border-[#ececec] bg-white p-3.5 shadow-sm">
            <h2 className="border-l-4 border-[#f5c400] pl-2 text-[15px] font-bold">Amount</h2>
            <label className="mt-3 flex items-center justify-between rounded-full border border-[#e4e4e4] px-4 py-3">
              <span className="text-[16px] font-bold">{country.currency}</span>
              <input
                type="number"
                inputMode="decimal"
                min={1}
                max={Number(player.balance)}
                step="0.01"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="0.00"
                className="w-40 bg-transparent text-right text-[18px] font-semibold outline-none"
                required
              />
            </label>
            <p className="mt-2 text-[12px] text-[#8a8a8a]">
              Withdrawable Balance ({country.currency}):{" "}
              {Number(player.balance).toLocaleString("en-GB", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </section>

          <button
            type="submit"
            disabled={busy || locked || !gateReady || amount <= 0 || amount > Number(player.balance)}
            className="h-12 w-full rounded-full bg-[#f5c400] text-[16px] font-black text-[#111] disabled:cursor-not-allowed"
          >
            {busy ? "Submitting…" : "Withdraw"}
          </button>

          {locked && (
            <p className="text-center text-[12px] text-[#6b6b6b]">
              Finish the deposits above before this withdrawal can be sent.
            </p>
          )}

          {message && (
            <p className="rounded-xl bg-[#e8f8ef] px-3 py-2.5 text-[12px] text-[#1b9a4b]">{message}</p>
          )}
          {error && (
            <p className="rounded-xl bg-[#fdecec] px-3 py-2.5 text-[12px] text-[#c0392b]">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}

function moneyCode(amount: number, currency: string) {
  return `${currency} ${Number(amount).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.length > 9 ? digits.slice(-9) : digits;
  const shown = local.startsWith("0") ? local : local ? `0${local}` : "";
  if (shown.length < 7) return shown;
  return `${shown.slice(0, 3)}***${shown.slice(-3)}`;
}
