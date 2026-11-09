"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CircleHelp, Smartphone, Check } from "lucide-react";
import { useSession } from "@/lib/store";
import { getCountry, formatMoney, maskPhoneTail } from "@/lib/countries";
import { Page } from "@/components/Shell";

/**
 * The deposit screen.
 *
 * The country's configured online gateway. The limits and fee notes at the
 * bottom are read from the same country configuration the endpoint enforces.
 */
export default function DepositPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [amount, setAmount] = useState("");
  const [phoneEdit, setPhoneEdit] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [switching, setSwitching] = useState<"phone" | "network" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<{ balance?: number; bonus?: number } | null>(null);
  const [limits, setLimits] = useState<{ min: number; first: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const country = player ? getCountry(player.country_code) : getCountry("GH");
  const phone = phoneEdit ?? player?.phone ?? "";
  const chosenNetwork = network ?? country.networks[0];
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  const value = Number(amount);
  const firstDeposit = limits?.first ?? country.minFirstDeposit;
  const min = limits?.min ?? country.minDeposit;
  const max = country.maxDeposit;

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    let alive = true;
    fetch(`/api/me?userId=${encodeURIComponent(player.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive || !json?.country) return;
        const nextMin = Number(json.country.minDeposit);
        const nextFirst = Number(json.country.minFirstDeposit);
        if (Number.isFinite(nextMin) && Number.isFinite(nextFirst)) {
          setLimits({ min: nextMin, first: nextFirst });
        }
      })
      .catch(() => {
        /* the country minimum still applies */
      });
    return () => {
      alive = false;
    };
  }, [player]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  // A credited deposit shows its confirmation, then returns to the home page.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => router.push("/"), 2200);
    return () => clearTimeout(t);
  }, [done, router]);

  if (!player) return null;

  const startGateway = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/deposits/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player.id, amount: value, phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not start your deposit");
        return;
      }

      if (json.redirectUrl) {
        window.location.href = json.redirectUrl;
        return;
      }

      setStatus(
        json.awaitingOtp
          ? "Approve the prompt on your phone, then enter the OTP your network sends."
          : "Check your phone and approve the payment prompt.",
      );

      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch(`/api/deposits/status?reference=${json.reference}`);
          const sj = await s.json();
          if (sj.status === "confirmed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus(null);
            setDone({ balance: sj.balance, bonus: sj.bonusPaid });
            if (typeof sj.balance === "number") setBalance(sj.balance);
          } else if (sj.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setStatus(null);
            setError("That payment did not go through. Try again.");
          }
        } catch {
          /* keep polling */
        }
      }, 4000);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Page>
        <div className="mx-auto max-w-md px-4 py-12">
          <div className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
              <Check size={30} strokeWidth={3} />
            </div>
            <h1 className="mt-4 text-[20px] font-black text-[var(--text-bright)]">Deposit received</h1>
            {done.bonus ? (
              <p className="mt-1 text-[13px] font-semibold text-[var(--accent)]">
                Plus a {formatMoney(done.bonus, player.currency)} welcome bonus.
              </p>
            ) : null}
            {typeof done.balance === "number" && (
              <p className="mt-2 text-[15px] font-bold tabular-nums">
                New balance {formatMoney(done.balance, player.currency)}
              </p>
            )}
            <button
              onClick={() => router.push("/")}
              className="mt-5 w-full rounded-[5px] bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)]"
            >
              Start betting
            </button>
          </div>
        </div>
      </Page>
    );
  }

  const tooSmall = value > 0 && value < min;
  const tooBig = value > max;
  const canSubmit = Boolean(country.gateway) && value >= min && value <= max && !busy;

  // Shortcut amounts from the real limits: the minimum and a few multiples
  // of it, never above the per-transaction cap.
  const quick = [min, min * 2, min * 5, min * 10].filter((a, i, all) => a <= max && all.indexOf(a) === i);

  return (
    <Page>
      <div className="mx-auto max-w-lg px-4 py-5">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="-ml-1 rounded p-1 text-[var(--text-bright)] hover:bg-[var(--surface)]"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <h1 className="flex-1 text-[20px] font-black text-[var(--text-bright)]">Deposit</h1>
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">
            Balance{" "}
            <span className="font-black tabular-nums text-[var(--text-bright)]">
              {formatMoney(Number(player.balance), player.currency)}
            </span>
          </span>
        </div>

        <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
          {!country.gateway ? (
            <p className="rounded bg-[var(--pending)]/15 px-3 py-3 text-[13px] font-semibold text-[var(--pending)]">
              Online deposits are not available in your country yet.
            </p>
          ) : (
            <>
              {/* Account rows */}
              <SwitchRow
                label="Pay from"
                icon={<Smartphone size={18} strokeWidth={1.8} className="text-[var(--text-muted)]" />}
                value={
                  <span className="tabular-nums">
                    <span className="text-[var(--text-muted)]">+{country.dialCode}</span>{" "}
                    <span className="text-[var(--text-bright)]">{maskPhoneTail(phone)}</span>
                  </span>
                }
                action={switching === "phone" ? "Done" : "Change"}
                onAction={() => setSwitching(switching === "phone" ? null : "phone")}
              />

              {switching === "phone" && (
                <input
                  value={phone}
                  onChange={(e) => setPhoneEdit(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  aria-label="Mobile money number"
                  placeholder={`0${"X".repeat(country.phoneDigits)}`}
                  className="mt-2 w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[14px] tabular-nums text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:border-[var(--accent)]"
                />
              )}

              <div className="mt-3">
                <SwitchRow
                  label="Network"
                  icon={
                    <span className="flex h-6 w-9 items-center justify-center rounded-[3px] bg-[var(--pending)] text-[9px] font-black text-[#071a33]">
                      {chosenNetwork.split(" ")[0].slice(0, 4).toUpperCase()}
                    </span>
                  }
                  value={<span className="text-[var(--text-bright)]">{chosenNetwork}</span>}
                  action={switching === "network" ? "Done" : "Change"}
                  onAction={() => setSwitching(switching === "network" ? null : "network")}
                />
              </div>

              {switching === "network" && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {country.networks.map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setNetwork(n);
                        setSwitching(null);
                      }}
                      className="rounded border px-3 py-2 text-[13px] font-semibold"
                      style={
                        chosenNetwork === n
                          ? {
                              borderColor: "var(--accent)",
                              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                              color: "var(--text-bright)",
                            }
                          : { borderColor: "var(--line)", color: "var(--text)" }
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <AmountField
                  currency={player.currency}
                  value={amount}
                  onChange={setAmount}
                  hint={`Min. ${min.toFixed(2)}`}
                  quick={quick}
                />
              </div>

              <button
                onClick={startGateway}
                disabled={!canSubmit}
                className="mt-4 w-full rounded-[5px] py-3 text-[15px] font-black transition-colors"
                style={
                  canSubmit
                    ? { background: "var(--accent)", color: "var(--accent-ink)" }
                    : { background: "var(--surface)", color: "var(--text-muted)" }
                }
              >
                {busy ? "Starting…" : value > 0 ? `Deposit ${formatMoney(value, player.currency)}` : "Deposit"}
              </button>
            </>
          )}

          {/* Feedback */}
          {(tooSmall || tooBig || status || error) && (
            <div className="mt-3 space-y-2">
              {tooSmall && (
                <p className="text-[12px] text-[var(--lose)]">
                  The minimum deposit is {formatMoney(min, player.currency)}.
                </p>
              )}
              {tooBig && (
                <p className="text-[12px] text-[var(--lose)]">
                  The most you can send in one transaction is {formatMoney(max, player.currency)}.
                </p>
              )}
              {status && (
                <p className="rounded bg-[var(--pending)]/15 px-3 py-2.5 text-[12px] font-semibold text-[var(--pending)]">
                  {status}
                </p>
              )}
              {error && (
                <p className="rounded bg-[var(--lose-bg)] px-3 py-2.5 text-[12px] text-[var(--lose)]">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* The rules, read from the same config the endpoint enforces. */}
        <div className="mt-4 rounded-md border border-[var(--line)] p-4">
          <h2 className="text-[13px] font-black text-[var(--text-bright)]">Good to know</h2>
          <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
            <li>
              Most per transaction:{" "}
              <strong className="tabular-nums text-[var(--text)]">{formatMoney(max, player.currency)}</strong>.
              To deposit more, make several payments.
            </li>
            <li>
              Least per deposit:{" "}
              <strong className="tabular-nums text-[var(--text)]">{formatMoney(min, player.currency)}</strong>
              {firstDeposit > min && (
                <>
                  . Your first deposit must be at least{" "}
                  <strong className="tabular-nums text-[var(--text)]">
                    {formatMoney(firstDeposit, player.currency)}
                  </strong>
                </>
              )}
              .
            </li>
            <li>There are no fees on deposits.</li>
            <li>You can only withdraw to the mobile number you registered with.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[12px] font-bold">
            <Link href="/how-to-play" className="inline-flex items-center gap-1 text-[var(--accent)]">
              <CircleHelp size={13} strokeWidth={2} />
              How deposits work
            </Link>
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)]"
              >
                Payment problem? Chat on WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

function SwitchRow({
  label,
  icon,
  value,
  action,
  onAction,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  action: string;
  onAction: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-bold text-[var(--text-muted)]">{label}</p>
      <div className="flex items-center gap-3 rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5">
        {icon}
        <span className="flex-1 text-[14px] font-semibold">{value}</span>
        <button onClick={onAction} type="button" className="text-[12px] font-bold text-[var(--accent)]">
          {action}
        </button>
      </div>
    </div>
  );
}

function AmountField({
  currency,
  value,
  onChange,
  hint,
  quick,
}: {
  currency: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  quick: number[];
}) {
  return (
    <div>
      <label htmlFor="amount" className="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">
        Amount ({currency})
      </label>
      <input
        id="amount"
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
        className="w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[18px] font-black tabular-nums text-[var(--input-ink)] outline-none placeholder:text-[14px] placeholder:font-normal placeholder:text-[var(--input-placeholder)] focus:border-[var(--accent)]"
      />
      {quick.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {quick.map((a) => {
            const on = Number(value) === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => onChange(String(a))}
                className="rounded border py-1.5 text-[12px] font-bold tabular-nums"
                style={
                  on
                    ? {
                        borderColor: "var(--accent)",
                        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                        color: "var(--text-bright)",
                      }
                    : { borderColor: "var(--line)", color: "var(--text)" }
                }
              >
                {a.toLocaleString()}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
