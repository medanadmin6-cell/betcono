"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Page } from "@/components/Shell";
import { BetSlip } from "@/components/BetSlip";
import { useSlip, type SlipLeg } from "@/lib/store";

/** Load a booking code and drop its selections straight into the slip. */
export default function LoadCodePage() {
  return (
    <Suspense fallback={null}>
      <LoadCodeForm />
    </Suspense>
  );
}

function LoadCodeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const load = useSlip((s) => s.load);

  // A shared link arrives as /load-code?code=ABC123; the code from it is
  // loaded on arrival, not just typed into the box.
  const linked = (params.get("code") ?? "").trim().toUpperCase();

  const [code, setCode] = useState(linked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  const loadCode = useCallback(
    async (value: string) => {
      const clean = value.trim().toUpperCase();
      if (!clean) return;
      setBusy(true);
      setError(null);
      setTicket(null);
      try {
        const res = await fetch(`/api/bookings/${encodeURIComponent(clean)}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "That code was not found");
          if (json.ticket) setTicket(json.ticket as string);
          return;
        }
        load(json.booking.selections as SlipLeg[]);
        router.push("/");
      } catch {
        setError("Network problem. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [load, router],
  );

  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current || linked.length < 4) return;
    autoLoaded.current = true;
    loadCode(linked);
  }, [linked, loadCode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCode(code);
  };

  return (
    <Page>
      <div className="mx-auto max-w-sm space-y-4 py-6">
        <h1 className="text-[18px] font-black">Load a booking code</h1>
        <p className="text-[13px] text-[var(--text-muted)]">
          Enter a code someone shared with you to get the same selections on your slip.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            className="w-full rounded-lg bg-[var(--surface-2)] px-3 py-4 text-center text-[24px] font-black tracking-[0.25em] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />

          {error && (
            <p className="rounded-lg bg-[var(--lose)]/15 px-3 py-2 text-[12px] text-[var(--lose)]">
              {error}
              {ticket && (
                <>
                  {" "}
                  <Link href={`/my-bets/${ticket}`} className="font-bold text-[var(--accent)] underline">
                    Open it in My Bets
                  </Link>
                </>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || code.trim().length < 4}
            className="w-full rounded-lg bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load code"}
          </button>
        </form>
      </div>

      <BetSlip />
    </Page>
  );
}
