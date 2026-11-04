"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Ticket, ShieldCheck, Wallet, CircleHelp, type LucideIcon } from "lucide-react";
import { useSlip, type SlipLeg } from "@/lib/store";

/**
 * The home page furniture around the board: the promo banner, the phone-only
 * shortcut tiles, the section heading every block shares, and the filter that
 * cuts the board by day.
 *
 * Promo photography lives in public/promo under the Pexels licence; see the
 * CREDITS file there. Swapping one is a file replacement, not a code change.
 */

// ------------------------------------------------------------- hero banner

interface Banner {
  art: string;
  title: string;
  kicker: string;
  cta: string;
  href: string;
}

const BANNERS: Banner[] = [
  {
    art: "/promo/stadium.jpg",
    kicker: "Football every day",
    title: "Every big league, priced before kickoff",
    cta: "See today's games",
    href: "/?tab=today",
  },
  {
    art: "/promo/welcome-bonus.jpg",
    kicker: "Welcome bonus",
    title: "GH₵100 on your first deposit",
    cta: "Create an account",
    href: "/register",
  },
  {
    art: "/promo/best-odds.jpg",
    kicker: "Boosted odds",
    title: "Better prices on selected matches daily",
    cta: "View boosted",
    href: "/?tab=boosted",
  },
  {
    art: "/promo/live-now.jpg",
    kicker: "In play",
    title: "Follow the score and bet as it happens",
    cta: "Go to live",
    href: "/?tab=live",
  },
];

export function HeroBanner() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % BANNERS.length), 7000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-md bg-[var(--chrome)]">
      <div
        className="flex transition-transform duration-700 ease-in-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {BANNERS.map((b, i) => (
          <Link
            key={b.title}
            href={b.href}
            tabIndex={i === index ? 0 : -1}
            className="relative block aspect-[2.2/1] w-full shrink-0 sm:aspect-[3.4/1]"
            aria-label={`${b.kicker}: ${b.title}`}
          >
            <Image
              src={b.art}
              alt=""
              fill
              sizes="(min-width: 1280px) 60vw, 100vw"
              className="object-cover"
              priority={i === 0}
            />
            {/* A flat scrim on the text side keeps the copy legible on any photo. */}
            <span className="absolute inset-y-0 left-0 w-full bg-[#071a33]/70 sm:w-[58%]" />
            <span className="absolute inset-y-0 left-0 flex max-w-[85%] flex-col justify-center p-4 sm:max-w-[52%] sm:p-7">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#9ff611] sm:text-[12px]">
                {b.kicker}
              </span>
              <span className="mt-1 text-[18px] font-black leading-tight text-white sm:text-[26px]">
                {b.title}
              </span>
              <span className="mt-3 inline-flex w-fit rounded-[5px] bg-[#9ff611] px-3 py-1.5 text-[12px] font-black text-[#071a33]">
                {b.cta}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="absolute bottom-2.5 right-3 z-10 flex items-center gap-1">
        {BANNERS.map((b, i) => (
          <button
            key={b.title}
            onClick={() => setIndex(i)}
            aria-label={`Show banner ${i + 1}`}
            aria-current={i === index}
            className={`h-1 transition-all ${i === index ? "w-5 bg-[#9ff611]" : "w-2.5 bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------- shortcut tiles

const SHORTCUTS: { label: string; href: string; Icon: LucideIcon }[] = [
  { label: "Load code", href: "/load-code", Icon: Ticket },
  { label: "Check bet", href: "/my-bets", Icon: ShieldCheck },
  { label: "Deposit", href: "/deposit", Icon: Wallet },
  { label: "How to play", href: "/how-to-play", Icon: CircleHelp },
];

/** Phone and tablet only; the sidebar carries these on desktop. */
export function Shortcuts() {
  return (
    <div className="grid grid-cols-4 gap-1.5 lg:hidden">
      {SHORTCUTS.map(({ label, href, Icon }) => (
        <Link
          key={label}
          href={href}
          className="flex flex-col items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] py-2.5 text-[11px] font-bold text-[var(--text)]"
        >
          <Icon size={18} strokeWidth={2} className="text-[var(--accent)]" />
          {label}
        </Link>
      ))}
    </div>
  );
}

// -------------------------------------------------------- section heading

export function SectionHeading({
  title,
  aside,
  live,
}: {
  title: string;
  aside?: React.ReactNode;
  live?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {live && <span className="live-dot h-2 w-2 rounded-full bg-[var(--live)]" />}
      <h2 className="text-[15px] font-black tracking-tight text-[var(--text-bright)]">{title}</h2>
      {aside && <div className="ml-auto">{aside}</div>}
    </div>
  );
}

// ------------------------------------------------------------- day filter

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "live", label: "Live" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "boosted", label: "Boosted" },
];

export function FilterBar({
  active,
  onChange,
}: {
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="scroll-x mb-2 inline-flex max-w-full rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-0.5"
      role="tablist"
      aria-label="Filter matches"
    >
      {FILTERS.map((f) => (
        <button
          key={f.key}
          role="tab"
          aria-selected={active === f.key}
          onClick={() => onChange(f.key)}
          className={`whitespace-nowrap rounded-[4px] px-3 py-1.5 text-[12px] font-bold transition-colors ${
            active === f.key
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------- load code widget

export function LoadCodeWidget() {
  const router = useRouter();
  const load = useSlip((s) => s.load);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setTicket(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(code.trim().toUpperCase())}`);
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
  };

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-2.5">
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Paste a booking code"
          maxLength={10}
          className="min-w-0 flex-1 rounded border border-[var(--field-line)] bg-[var(--input)] px-2.5 py-2 text-[13px] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="shrink-0 rounded bg-[var(--accent)] px-3 py-2 text-[13px] font-bold text-[var(--accent-ink)] disabled:opacity-50"
        >
          {busy ? "…" : "Load"}
        </button>
      </form>
      {error && (
        <p className="mt-1.5 px-1 text-[11px] text-[var(--lose)]">
          {error}
          {ticket && (
            <>
              {" "}
              <Link href={`/my-bets/${ticket}`} className="font-bold underline">
                Open it in My Bets
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
