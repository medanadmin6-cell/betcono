"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ShieldCheck,
  Ticket,
  Grid3x3,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useSlip, type SlipLeg } from "@/lib/store";
import { BallIcon } from "@/components/icons";

/**
 * The home page furniture above the board, mirroring the reference: the hero
 * banner carousel, the square sport tiles, the sport pills, and the search +
 * filter bar that drives the events board.
 *
 * Promo photography lives in public/promo under the Pexels licence — see the
 * CREDITS file there. Swapping one is a file replacement, not a code change.
 */

// ------------------------------------------------------------- hero banner

interface Banner {
  art: string;
  title: string;
  kicker: string;
  href: string;
}

const BANNERS: Banner[] = [
  {
    art: "/promo/messi.jpg",
    kicker: "Football every day",
    title: "Back greatness — bet on the world's game",
    href: "/?tab=today",
  },
  {
    art: "/promo/welcome-bonus.jpg",
    kicker: "Welcome Bonus",
    title: "GH₵100 on your first deposit",
    href: "/register",
  },
  {
    art: "/promo/best-odds.jpg",
    kicker: "Bet like a champion",
    title: "Boosted odds every day",
    href: "/?tab=boosted",
  },
  {
    art: "/promo/live-now.jpg",
    kicker: "Live now",
    title: "Bet in play, cash out fast",
    href: "/?tab=live",
  },
];

export function HeroBanner() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % BANNERS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mx-2.5 my-3 md:mx-5">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] shadow-xl">
        <div
          className="flex transition-transform duration-700 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {BANNERS.map((b) => (
            <Link
              key={b.title}
              href={b.href}
              className="relative aspect-[16/9] w-full shrink-0 sm:aspect-[21/9]"
              aria-label={`${b.kicker} — ${b.title}`}
            >
              <Image src={b.art} alt="" fill sizes="100vw" className="object-cover" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
                <span className="block text-[13px] font-black uppercase tracking-wider text-[var(--accent)] sm:text-[15px]">
                  {b.kicker}
                </span>
                <span className="block text-[17px] font-black text-white sm:text-[22px]">
                  {b.title}
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
          {BANNERS.map((b, i) => (
            <button
              key={b.title}
              onClick={() => setIndex(i)}
              aria-label={`Go to banner ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-[var(--accent)]" : "w-1.5 bg-zinc-600"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- sport tiles

const TILES: {
  label: string;
  href: string;
  Icon?: LucideIcon | typeof BallIcon;
  art?: string;
  hot?: boolean;
  active?: boolean;
}[] = [
  { label: "Soccer", href: "/", Icon: BallIcon, active: true },
  { label: "Today", href: "/?tab=today", Icon: Calendar },
  { label: "Games", href: "/games", art: "/image.png", hot: true },
  { label: "Verify Bet", href: "/my-bets", Icon: ShieldCheck },
  { label: "Booking Codes", href: "/load-code", Icon: Ticket },
  { label: "All", href: "/az", Icon: Grid3x3 },
];

export function SportTiles() {
  return (
    <div className="scroll-x mx-2.5 flex gap-2 pb-1 md:mx-5">
      {TILES.map(({ label, href, Icon, art, hot, active }) => (
        <Link
          key={label}
          href={href}
          className={`relative flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border transition-colors md:h-20 md:w-20 ${
            active
              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shadow-lg shadow-amber-400/10"
              : "border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--text-muted)]"
          }`}
        >
          {art ? (
            <Image src={art} alt="" width={40} height={40} className="h-9 w-9 object-contain md:h-11 md:w-11" />
          ) : (
            Icon && <Icon size={22} strokeWidth={1.7} />
          )}
          <span className="px-0.5 text-center text-[10px] font-bold leading-tight">{label}</span>
          {hot && (
            <span className="absolute right-1 top-1 animate-pulse rounded-full bg-[var(--lose)] px-1 text-[8px] font-black text-white">
              HOT
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- sport pills

const PILLS = [
  { label: "Soccer", href: "/", active: true },
  { label: "Live", href: "/?tab=live" },
  { label: "Today", href: "/?tab=today" },
  { label: "Tomorrow", href: "/?tab=tomorrow" },
  { label: "Best Odds", href: "/?tab=boosted" },
];

export function SportPills() {
  return (
    <div className="scroll-x mx-2.5 flex items-center gap-1.5 pb-1 pt-2 md:mx-5">
      {PILLS.map((p) => (
        <Link
          key={p.label}
          href={p.href}
          className={`whitespace-nowrap rounded-xl px-4 py-1.5 text-[12px] font-bold transition-all ${
            p.active
              ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-md shadow-amber-400/20"
              : "border border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--text-muted)]"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- filter bar

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "today", label: "📅 Today" },
  { key: "live", label: "🔴 Live" },
  { key: "tomorrow", label: "⏳ Tomorrow" },
  { key: "boosted", label: "🔥 Best Odds" },
];

export function FilterBar({
  active,
  onChange,
}: {
  active: string;
  onChange: (key: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="mx-2.5 flex flex-col gap-2 py-2 sm:flex-row sm:items-center md:mx-5">
      <form onSubmit={submit} className="relative flex-1">
        <Search
          size={15}
          strokeWidth={2.2}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search teams or leagues..."
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] py-2.5 pl-10 pr-4 text-[12px] font-semibold text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
        />
      </form>
      <div className="scroll-x flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => onChange(f.key)}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-[12px] font-extrabold transition-all ${
              active === f.key
                ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-md shadow-amber-400/20"
                : "border border-[var(--line)] bg-[var(--bg-elevated)] text-[var(--text-muted)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
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
    <div className="mx-2.5 mt-2 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-2.5 md:mx-5">
      <form onSubmit={submit} className="flex items-center gap-2 rounded-lg bg-[var(--bg)] p-1.5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Paste any booking code"
          maxLength={10}
          className="min-w-0 flex-1 bg-transparent px-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-2 text-[13px] font-bold text-[var(--accent-ink)] disabled:opacity-50"
        >
          {busy ? "…" : "Load Code"}
        </button>
      </form>
      {error && (
        <p className="mt-1.5 px-1 text-[11px] text-[var(--lose)]">
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
    </div>
  );
}
