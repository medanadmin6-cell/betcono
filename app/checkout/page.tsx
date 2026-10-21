"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Check, Loader2, Smartphone } from "lucide-react";

/**
 * Our own deposit checkout, on our own domain, in our own colors.
 *
 * The player lands here from the deposit screen with a pending AlphaPay
 * payment already initialized. They confirm the mobile-money number, the
 * handset prompt goes out, and the page polls until the rail confirms. A
 * network that answers with a code instead has a field waiting for it —
 * no detour through the gateway's hosted page.
 */

interface Session {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  phone: string;
}

type Stage = "loading" | "number" | "waiting" | "confirmed" | "failed" | "missing";

function money(amount: number, currency: string): string {
  const symbol = currency === "GHS" ? "GH₵" : currency === "NGN" ? "₦" : `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

function CheckoutInner() {
  const router = useRouter();
  const reference = useSearchParams().get("reference") ?? "";

  const [session, setSession] = useState<Session | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!reference) {
      setStage("missing");
      return;
    }
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
        if (j.status === "confirmed" || j.status === "resolved") {
          setStage("confirmed");
          setTimeout(() => router.push("/"), 1600);
        } else if (j.status === "failed") setStage("failed");
        else setStage("number");
      })
      .catch(() => {
        if (!cancelled) setStage("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [reference, router]);

  const poll = useCallback(() => {
    if (!reference) return;
    fetch(`/api/deposits/status?reference=${encodeURIComponent(reference)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.status === "confirmed") {
          setStage("confirmed");
          setTimeout(() => router.push("/"), 1600);
          return;
        }
        if (j.status === "failed") {
          setStage("failed");
          return;
        }
        pollTimer.current = setTimeout(poll, 4000);
      })
      .catch(() => {
        pollTimer.current = setTimeout(poll, 4000);
      });
  }, [reference, router]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const sendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/deposits/alphapay/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, phone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not send the prompt");
        return;
      }
      setStage("waiting");
      poll();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCodeBusy(true);
    try {
      const res = await fetch("/api/deposits/alphapay/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, code }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That code was not accepted");
        return;
      }
      setCode("");
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setCodeBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-elevated)] p-6 ring-1 ring-[var(--line)] shadow-xl">
        <div className="flex justify-center">
          <Image src="/logo.svg" alt="BetCono" width={120} height={26} priority />
        </div>

        {stage === "loading" && (
          <div className="flex justify-center py-12">
            <Loader2 size={26} className="animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {stage === "missing" && (
          <div className="py-8 text-center">
            <p className="text-[14px] font-bold">This payment link is not valid.</p>
            <Link
              href="/deposit"
              className="mt-4 inline-block rounded-xl bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
            >
              Start a deposit
            </Link>
          </div>
        )}

        {session && stage !== "loading" && stage !== "missing" && (
          <div className="mt-5 text-center">
            <p className="text-[12px] text-[var(--text-muted)]">Deposit</p>
            <p className="font-display mt-0.5 text-[34px] leading-none text-[var(--text-bright)]">
              {money(session.amount, session.currency)}
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">Ref {session.reference}</p>
          </div>
        )}

        {stage === "number" && (
          <form onSubmit={sendPrompt} className="mt-6 space-y-3">
            <label className="block text-[12px] font-bold" htmlFor="momo">
              Mobile money number
            </label>
            <input
              id="momo"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0241234567"
              required
              className="w-full rounded-xl bg-[var(--input)] px-3.5 py-3 text-[14px] text-[var(--input-ink)] ring-1 ring-[var(--field-line)] outline-none placeholder:text-[var(--input-placeholder)] focus:ring-2 focus:ring-[var(--accent)]"
            />
            {error && (
              <p className="rounded-lg bg-[var(--lose)]/15 px-3 py-2 text-[12px] text-[var(--lose)]">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)] disabled:opacity-50"
            >
              {busy ? "Sending…" : "Pay now"}
            </button>
          </form>
        )}

        {stage === "waiting" && (
          <div className="mt-6">
            <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-3)] px-3.5 py-3">
              <Smartphone size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <div>
                <p className="text-[13px] font-bold">Approve on your phone</p>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  A prompt was sent to {phone}. Enter your mobile money PIN to pay. This page
                  updates by itself.
                </p>
              </div>
            </div>

            <form onSubmit={submitCode} className="mt-4 space-y-2">
              <label className="block text-[12px] font-bold" htmlFor="otp">
                Got a code instead? Enter it here
              </label>
              <div className="flex gap-2">
                <input
                  id="otp"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter code"
                  className="min-w-0 flex-1 rounded-xl bg-[var(--input)] px-3.5 py-2.5 text-[14px] tracking-[0.2em] text-[var(--input-ink)] ring-1 ring-[var(--field-line)] outline-none placeholder:tracking-normal placeholder:text-[var(--input-placeholder)] focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={codeBusy || !code.trim()}
                  className="shrink-0 rounded-xl bg-[var(--accent)] px-4 text-[13px] font-black text-[var(--accent-ink)] disabled:opacity-50"
                >
                  {codeBusy ? "…" : "Verify"}
                </button>
              </div>
            </form>

            {error && (
              <p className="mt-3 rounded-lg bg-[var(--lose)]/15 px-3 py-2 text-[12px] text-[var(--lose)]">{error}</p>
            )}

            <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[var(--text-faint)]">
              <Loader2 size={14} className="animate-spin" />
              Waiting for the network to confirm…
            </div>
          </div>
        )}

        {stage === "confirmed" && (
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

        {stage === "failed" && (
          <div className="mt-6 pb-2 text-center">
            <p className="text-[14px] font-bold text-[var(--lose)]">This payment did not go through.</p>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              Nothing was taken. You can start the deposit again.
            </p>
            <Link
              href="/deposit"
              className="mt-4 inline-block rounded-xl bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
            >
              Try again
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-[var(--text-faint)]">
          Secured by AlphaPay · BetCono never sees your PIN
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
