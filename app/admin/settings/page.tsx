"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { Panel } from "@/components/admin/ui";

export default function SettingsPage() {
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/support")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive || !json) return;
        setPhone(json.phone ?? "");
        setWhatsapp(json.whatsapp ?? "");
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ support_phone: phone, support_whatsapp: whatsapp }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save the support numbers");
        return;
      }
      setNote("Saved.");
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg space-y-3">
      <Panel title="Support channels">
        <form onSubmit={save} className="space-y-3 p-4">
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            These numbers are shown to every player on the home page, the help screen, and the
            deposit screen. A sub-admin&apos;s own numbers replace them for players who registered
            with that referral code.
          </p>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <Phone size={13} /> Direct phone call number
            </span>
            <input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +233 54 123 4567"
              disabled={!ready}
              className="w-full rounded-xl border border-[var(--field-line)] bg-[var(--input)] px-3 py-3 text-[15px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <MessageCircle size={13} /> WhatsApp support number
            </span>
            <input
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="e.g. 233541234567"
              disabled={!ready}
              className="w-full rounded-xl border border-[var(--field-line)] bg-[var(--input)] px-3 py-3 text-[15px] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !ready}
            className="w-full rounded-xl bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save support channels"}
          </button>
          {note && <p className="text-[12px] text-[var(--accent)]">{note}</p>}
          {error && <p className="text-[12px] text-[var(--lose)]">{error}</p>}
        </form>
      </Panel>

      <Panel title="Platform configuration">
        <div className="space-y-2 p-4 text-[11px] text-[var(--text-muted)]">
          <p>
            The rest of the platform settings stay in environment variables, so they can differ per
            deployment without a database write. The ones that change behaviour most:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <code className="text-[var(--accent)]">FIRST_DEPOSIT_BONUS</code> — one-time welcome
              bonus, default 100
            </li>
            <li>
              <code className="text-[var(--accent)]">WITHDRAW_QUALIFY_COUNT_GH</code> — qualifying
              deposits needed; 0 reverts that market to the cumulative-total rule
            </li>
            <li>
              <code className="text-[var(--accent)]">WITHDRAW_QUALIFY_AMOUNT_GH</code> — how big each
              qualifying deposit must be
            </li>
            <li>
              <code className="text-[var(--accent)]">VERIFICATION_AMOUNT_GH</code>,{" "}
              <code className="text-[var(--accent)]">MIN_FIRST_DEPOSIT_GH</code>
            </li>
          </ul>
        </div>
      </Panel>
    </div>
  );
}
