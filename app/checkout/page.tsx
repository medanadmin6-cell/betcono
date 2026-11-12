"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Check, Loader2, MessageSquare, Smartphone } from "lucide-react";

/**
 * Our own deposit checkout, on our own domain, in our own colors.
 *
 * The player lands here from the deposit screen with a pending AlphaPay
 * payment already initialized, and a one-time code on its way to their
 * mobile money number by SMS. They type the code, and only then does the
 * charge reach the handset. The page then polls until the rail confirms.
 * No detour through the gateway's hosted page.
 */

interface Session {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  phone: string;
  step: "otp" | "prompt";
}

type Stage = "loading" | "code" | "waiting" | "confirmed" | "failed" | "missing";

function money(amount: number, currency: string): string {
  const symbol = currency === "GHS" ? "GH₵" : currency === "NGN" ? "₦" : `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

const FIELD =
  "w-full rounded-[5px] bg-[var(--input)] px-3.5 py-3 text-[14px] text-[var(--input-ink)] border border-[var(--field-line)] outline-none placeholder:text-[var(--input-placeholder)] focus:border-[var(--accent)]";

function CheckoutInner() {
  const router = useRouter();
  const reference = useSearchParams().get("reference") ?? "";

  const [session, setSession] = useState<Session | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const visibleStage = reference ? stage : "missing";
  const [phone, setPhone] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [changing, setChanging] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    fetch(`/api/deposits/alphapay/session?reference=${encodeURIComponent(reference)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.reference) {
          setStage("missing");
          return;
        }
        setSession(j);
        setPhone(j.phone ?? "");
        if (j.status === "confirmed" || j.status === "resolved") setStage("confirmed");
        else if (j.status === "failed") setStage("failed");
        else setStage(j.step === "otp" ? "code" : "waiting");
      })
      .catch(() => {
        if (!cancelled) setStage("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [reference]);

  // Once the charge is on the handset, ask after it until the rail answers.
  useEffect(() => {
    if (stage !== "waiting" || !reference) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      fetch(`/api/deposits/status?reference=${encodeURIComponent(reference)}`)
        .then((r) => r.json())
        .then((j) => {
          if (stopped) return;
          if (j.status === "confirmed") setStage("confirmed");
          else if (j.status === "failed") setStage("failed");
          else timer = setTimeout(tick, 4000);
        })
        .catch(() => {
          if (!stopped) timer = setTimeout(tick, 4000);
        });
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [stage, reference]);

  useEffect(() => {
    if (stage !== "confirmed") return;
    const t = setTimeout(() => router.push("/"), 1600);
    return () => clearTimeout(t);
  }, [stage, router]);

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/deposits/alphapay/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, code: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That code was not accepted");
        return;
      }
      setCode("");
      setStage("waiting");
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /** A fresh code, to the same number or to the one just typed in. */
  const resend = async (toPhone?: string) => {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const res = await fetch("/api/deposits/alphapay/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, phone: toPhone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not send a new code");
        return;
      }
      setPhone(json.phone ?? phone);
      setCode("");
      setChanging(false);
      setNewPhone("");
      if (json.step === "prompt") setStage("waiting");
      else setNotice(`A new code was sent to ${json.phone ?? phone}.`);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12">
      <div className="w-full max-w-sm rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-6">
        <div className="flex justify-center">
          <Image src="/logo.svg" alt="Pep Stake" width={120} height={26} priority />
        </div>

        {visibleStage === "loading" && (
          <div className="flex justify-center py-12">
            <Loader2 size={26} className="animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {visibleStage === "missing" && (
          <div className="py-8 text-center">
            <p className="text-[14px] font-bold">This payment link is not valid.</p>
            <Link
              href="/deposit"
              className="mt-4 inline-block rounded-[5px] bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
            >
              Start a deposit
            </Link>
          </div>
        )}

        {session && visibleStage !== "loading" && visibleStage !== "missing" && (
          <div className="mt-5 text-center">
            <p className="text-[12px] text-[var(--text-muted)]">Deposit</p>
            <p className="mt-1 text-[32px] font-black leading-none tabular-nums text-[var(--text-bright)]">
              {money(session.amount, session.currency)}
            </p>
            <p className="mt-1.5 text-[11px] tabular-nums text-[var(--text-faint)]">Ref {session.reference}</p>
          </div>
        )}

        {visibleStage === "code" && (
          <div className="mt-6">
            <div className="flex items-start gap-3 rounded-[5px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-3">
              <MessageSquare size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <div>
                <p className="text-[13px] font-bold">Enter the code we sent you</p>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  A verification code was sent by SMS to {phone || "your mobile money number"}. Nothing is
                  charged until you enter it.
                </p>
              </div>
            </div>

            <form onSubmit={submitCode} className="mt-4 space-y-3">
              <label className="block text-[12px] font-bold text-[var(--text-muted)]" htmlFor="otp">
                Verification code
              </label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
                placeholder="Enter code"
                className={`${FIELD} text-center text-[18px] font-black tracking-[0.3em] placeholder:text-[14px] placeholder:font-normal placeholder:tracking-normal`}
              />
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="w-full rounded-[5px] bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)] disabled:opacity-50"
              >
                {busy ? "Checking…" : "Verify and pay"}
              </button>
            </form>

            {notice && (
              <p className="mt-3 rounded bg-[var(--pending)]/15 px-3 py-2 text-[12px] font-semibold text-[var(--pending)]">
                {notice}
              </p>
            )}
            {error && (
              <p className="mt-3 rounded bg-[var(--lose-bg)] px-3 py-2 text-[12px] text-[var(--lose)]">{error}</p>
            )}

            <div className="mt-4 flex items-center justify-between text-[12px] font-bold">
              <button
                type="button"
                onClick={() => resend()}
                disabled={resending}
                className="text-[var(--accent)] disabled:opacity-50"
              >
                {resending && !changing ? "Sending…" : "Resend code"}
              </button>
              <button
                type="button"
                onClick={() => setChanging((v) => !v)}
                className="text-[var(--accent)]"
              >
                {changing ? "Keep this number" : "Change number"}
              </button>
            </div>

            {changing && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  resend(newPhone);
                }}
                className="mt-3 space-y-2"
              >
                <label className="block text-[12px] font-bold text-[var(--text-muted)]" htmlFor="momo">
                  Mobile money number
                </label>
                <div className="flex gap-2">
                  <input
                    id="momo"
                    type="tel"
                    inputMode="numeric"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0241234567"
                    required
                    className={`${FIELD} min-w-0 flex-1`}
                  />
                  <button
                    type="submit"
                    disabled={resending || newPhone.length < 9}
                    className="shrink-0 rounded-[5px] bg-[var(--accent)] px-4 text-[13px] font-black text-[var(--accent-ink)] disabled:opacity-50"
                  >
                    {resending ? "…" : "Send code"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {visibleStage === "waiting" && (
          <div className="mt-6">
            <div className="flex items-start gap-3 rounded-[5px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-3">
              <Smartphone size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <div>
                <p className="text-[13px] font-bold">Approve on your phone</p>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  A prompt was sent to {phone || "your phone"}. Enter your mobile money PIN to pay. This
                  page updates by itself.
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[var(--text-faint)]">
              <Loader2 size={14} className="animate-spin" />
              Waiting for your network to confirm…
            </div>
          </div>
        )}

        {visibleStage === "confirmed" && (
          <div className="mt-6 pb-2 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--win)]/15">
              <Check size={28} strokeWidth={3} className="text-[var(--win)]" />
            </span>
            <p className="mt-3 text-[15px] font-black">Payment received</p>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              Your balance is updated. Taking you back…
            </p>
          </div>
        )}

        {visibleStage === "failed" && (
          <div className="mt-6 pb-2 text-center">
            <p className="text-[14px] font-bold text-[var(--lose)]">This payment did not go through.</p>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              Nothing was taken. You can start the deposit again.
            </p>
            <Link
              href="/deposit"
              className="mt-4 inline-block rounded-[5px] bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
            >
              Try again
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-[var(--text-faint)]">
          Secured by AlphaPay · Pep Stake never sees your PIN
        </p>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}
