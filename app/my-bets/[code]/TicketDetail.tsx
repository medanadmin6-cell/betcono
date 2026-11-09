"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Headphones,
  Home,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { useSlip, useSession, type SlipLeg } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { marketName } from "@/lib/markets";

/**
 * One ticket in full.
 *
 * The status rail down the side of each leg is the point of the layout: a
 * ten-leg ticket is scannable at a glance because every leg says where it
 * stands without the reader having to compare numbers.
 */

interface Leg {
  id: string;
  match_id: string;
  home_team: string;
  away_team: string;
  league: string | null;
  sport: string;
  kickoff: string | null;
  market: string;
  outcome: string;
  odds: number;
  result: string;
  final_home: number | null;
  final_away: number | null;
  currentOdds?: number | null;
  isLive?: boolean;
  liveHome?: number | null;
  liveAway?: number | null;
  minuteLabel?: string | null;
}

interface Bet {
  code: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  bonus: number;
  currency: string;
  status: string;
  payout: number | null;
  mode: string;
  cashout_amount: number | null;
  created_at: string;
}

interface Payload {
  bet: Bet;
  owner: { name: string | null };
  selections: Leg[];
  cashout: { available: boolean; amount: number; potential: number; reason?: string };
}

const STATUS: Record<string, { label: string; colour: string }> = {
  pending: { label: "Open", colour: "var(--pending)" },
  won: { label: "Won", colour: "var(--win)" },
  lost: { label: "Lost", colour: "var(--lose)" },
  cashed_out: { label: "Cashed out", colour: "var(--pending)" },
  void: { label: "Void", colour: "var(--text-muted)" },
};

export function TicketDetail({ code }: { code: string }) {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);
  const load = useSlip((s) => s.load);

  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/bets/${code}?userId=${player.id}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(json.error ?? "Could not load this ticket");
          return;
        }
        setData(json);
        setError(null);
      } catch {
        if (alive) setError("Could not load this ticket");
      }
    })();

    return () => {
      alive = false;
    };
  }, [player, code, nonce]);

  // While anything on the ticket is still running, keep the score and the
  // cashout offer current. Both move on their own, and a stale number on
  // either is worse than none.
  useEffect(() => {
    if (data?.bet.status !== "pending") return;
    const timer = setInterval(reload, 30_000);
    return () => clearInterval(timer);
  }, [data?.bet.status, reload]);

  const cashout = async () => {
    if (!player || !data?.cashout.available) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/bets/${code}/cashout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player.id, expected: data.cashout.amount }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNote(json.error ?? "Could not cash out");
        if (json.moved) reload();
        return;
      }
      setNote(`Cashed out for ${formatMoney(json.amount, data.bet.currency)}.`);
      if (typeof json.balance === "number") setBalance(json.balance);
      reload();
    } catch {
      setNote("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  /** Share the win, falling back to the clipboard where there is no share sheet. */
  const showOff = async () => {
    if (!data) return;
    const amount = formatMoney(Number(data.bet.payout ?? 0), data.bet.currency);
    const text = `I just won ${amount} on Pep Stake. Ticket ${data.bet.code}.`;
    const url = typeof window !== "undefined" ? window.location.origin : "";

    if (navigator.share) {
      try {
        await navigator.share({ title: "Pep Stake win", text, url });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await copyText(`${text} ${url}`);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  /** Put the same selections back on the slip. */
  const rebet = () => {
    if (!data) return;
    const legs: SlipLeg[] = data.selections.map((l) => ({
      matchId: l.match_id,
      homeTeam: l.home_team,
      awayTeam: l.away_team,
      league: l.league ?? "",
      kickoff: l.kickoff ?? "",
      market: l.market,
      marketLabel: marketName(l.market),
      outcome: l.outcome,
      outcomeLabel: l.outcome,
      odds: Number(l.odds),
    }));
    load(legs);
    router.push("/");
  };

  const book = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: player?.id ?? null,
          expiresInHours: 48,
          selections: data.selections.map((l) => ({
            matchId: l.match_id,
            homeTeam: l.home_team,
            awayTeam: l.away_team,
            league: l.league ?? "",
            kickoff: l.kickoff ?? "",
            market: l.market,
            marketLabel: marketName(l.market),
            outcome: l.outcome,
            outcomeLabel: l.outcome,
            odds: Number(l.odds),
          })),
        }),
      });
      const json = await res.json();
      setNote(res.ok ? `Booking code ${json.code}` : (json.error ?? "Could not book"));
    } catch {
      setNote("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!player) return null;

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header onBack={() => router.back()} />
        <div className="p-10 text-center">
          <p className="text-[14px] text-[var(--text-muted)]">{error}</p>
          <Link
            href="/my-bets"
            className="mt-4 inline-block rounded bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
          >
            Back to my bets
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header onBack={() => router.back()} />
        <div className="mx-auto max-w-2xl animate-pulse space-y-2 p-3">
          <div className="h-40 rounded-md bg-[var(--bg-elevated)]" />
          <div className="h-32 rounded-md bg-[var(--bg-elevated)]" />
        </div>
      </div>
    );
  }

  const { bet, selections, cashout: offer } = data;
  const status = STATUS[bet.status] ?? STATUS.pending;
  const settled = bet.status !== "pending";
  const won = bet.status === "won" || bet.status === "cashed_out";

  const placed = new Date(bet.created_at);
  const whenLabel = placed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", " at");
  const returned = settled ? Number(bet.payout ?? 0) : Number(bet.potential_win);

  return (
    <div className="min-h-screen bg-[#f3f5f8] pb-28">
      <Header onBack={() => router.back()} />

      <section className="relative overflow-hidden bg-[#102033] px-4 pb-4 pt-3 text-white">
        <Trophy
          size={92}
          strokeWidth={1.2}
          className="pointer-events-none absolute right-3 top-8 text-white/10"
        />
        <div className="flex items-start justify-between gap-3 text-[12px] text-white/70">
          <span>
            Ticket ID: <span className="font-bold tracking-wide text-white">{bet.code}</span>
          </span>
          <span className="shrink-0 tabular-nums">{whenLabel}</span>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[18px] font-black capitalize">{bet.mode}</p>
            <p className="mt-3 text-[13px] text-white/70">
              {settled ? "Total Return" : "Potential Return"}
            </p>
            <p className="mt-3 text-[13px] text-white/70">Total Stake</p>
            <p className="mt-2 text-[13px] text-white/70">Total Odds</p>
          </div>
          <div className="pt-6 text-right">
            <p className="flex items-center justify-end gap-1 text-[14px] font-bold text-[#3DDC97]">
              {won && <Trophy size={16} strokeWidth={2.2} />}
              {status.label}
            </p>
            <p className="mt-1 text-[28px] font-black leading-none tabular-nums text-[#3DDC97]">
              {returned.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-[13px] font-semibold tabular-nums text-white/90">
              {bet.currency} {Number(bet.stake).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-[13px] font-semibold tabular-nums text-white/90">
              {Number(bet.total_odds).toFixed(2)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-[12px]">
          <span className="text-white/70">
            Verify Code: <span className="font-bold tracking-wide text-[#3DDC97]">{bet.code}</span>
          </span>
          <button
            type="button"
            onClick={showOff}
            className="flex shrink-0 items-center gap-1 font-semibold text-white/80"
          >
            <ShieldCheck size={14} strokeWidth={2.2} className="text-[#3DDC97]" />
            {shared ? "Copied" : "Pep Stake"}
          </button>
        </div>
      </section>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {selections.map((leg) => (
          <LegCard key={leg.id} leg={leg} />
        ))}
      </div>

      {note && (
        <p className="mx-auto max-w-2xl px-4 text-center text-[12px] text-[var(--text-muted)]">{note}</p>
      )}

      {!offer.available && offer.reason && bet.status === "pending" && (
        <p className="mx-auto max-w-2xl px-4 pt-2 text-center text-[11px] text-[var(--text-faint)]">
          {reasonText(offer.reason)}
        </p>
      )}

      {/* Actions */}
      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl gap-2">
          <button
            onClick={book}
            disabled={busy}
            className="flex-1 rounded border border-[var(--line)] py-2.5 text-[13px] font-bold text-[var(--text)] disabled:opacity-40"
          >
            Booking code
          </button>
          <button
            onClick={rebet}
            className="flex-1 rounded border border-[var(--line)] py-2.5 text-[13px] font-bold text-[var(--text)]"
          >
            Rebet
          </button>
          <button
            onClick={cashout}
            disabled={busy || !offer.available}
            className="flex-1 rounded py-2.5 text-[13px] font-black tabular-nums text-[var(--accent-ink)] disabled:opacity-30"
            style={{ background: "var(--accent)" }}
          >
            {offer.available
              ? `Cash out ${formatMoney(offer.amount, bet.currency)}`
              : "Cash out"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The result of a leg in words, for the markets a final score can settle
 * unambiguously. Anything else returns null rather than a guess.
 */
function describeOutcome(leg: Leg): string | null {
  if (leg.final_home === null || leg.final_away === null) return null;

  const h = leg.final_home;
  const a = leg.final_away;
  const market = leg.market.toLowerCase();

  if (market === "1x2" || market === "af1") {
    return h > a ? "Home" : h < a ? "Away" : "Draw";
  }
  if (market === "af8" || market === "btts") {
    return h > 0 && a > 0 ? "Yes" : "No";
  }
  if (market === "af5" || market === "af50" || market.startsWith("ou")) {
    return `${h + a} goals`;
  }
  if (market === "af21" || market === "oe") {
    return (h + a) % 2 === 1 ? "Odd" : "Even";
  }
  if (market === "af10" || market === "cs" || market === "eg") {
    return `${h}:${a}`;
  }
  return null;
}

/** Navy bar for the ticket, with a way home. */
function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-[#071a33]">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-3 text-white">
        <button onClick={onBack} aria-label="Back" className="flex items-center gap-1 rounded p-1 hover:bg-white/10">
          <ArrowLeft size={20} strokeWidth={2} />
          <span className="text-[14px] font-semibold">Back</span>
        </button>
        <h1 className="flex-1 text-center text-[16px] font-black">Ticket Details</h1>
        <Link href="/account" aria-label="Help" className="rounded p-1.5 hover:bg-white/10">
          <Headphones size={18} strokeWidth={2} />
        </Link>
        <Link href="/" aria-label="Home" className="rounded p-1.5 hover:bg-white/10">
          <Home size={18} strokeWidth={2} />
        </Link>
      </div>
    </header>
  );
}

function LegCard({ leg }: { leg: Leg }) {
  const won = leg.result === "won";
  const lost = leg.result === "lost";
  const settledScore = leg.final_home !== null && leg.final_away !== null;
  const homeScore = settledScore ? leg.final_home : (leg.liveHome ?? null);
  const awayScore = settledScore ? leg.final_away : (leg.liveAway ?? null);
  const scoreLabel =
    homeScore !== null && awayScore !== null ? `${homeScore}:${awayScore}` : "–";
  const outcome = describeOutcome(leg);
  const when = leg.kickoff
    ? new Date(leg.kickoff).toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const gameId = leg.match_id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();

  return (
    <article>
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: won ? "#1b9a4b" : lost ? "#d64545" : "#8b97a6" }}
        >
          {lost ? (
            <span className="text-[12px] font-black leading-none">×</span>
          ) : (
            <Check size={12} strokeWidth={3} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={`/match/${leg.match_id}`} className="block text-[15px] font-black text-[#1c2838]">
            {leg.home_team} v {leg.away_team}
          </Link>
          <p className="mt-0.5 text-[11px] text-[#8b97a6]">
            Game ID: {gameId || "—"}
            {when ? ` | ${when}` : ""}
            {leg.minuteLabel ? ` · ${leg.minuteLabel}` : ""}
          </p>
        </div>
      </div>

      <dl className="mt-2 space-y-2 rounded-md bg-[#e7f6ee] px-3 py-3 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[#607084]">Pick</dt>
          <dd className="flex items-center gap-1 font-bold tabular-nums text-[#1c2838]">
            {leg.outcome}@{Number(leg.odds).toFixed(2)}
            {won && <Check size={14} strokeWidth={3} className="text-[#1b9a4b]" />}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[#607084]">Market</dt>
          <dd className="text-right font-semibold text-[#1c2838]">{marketName(leg.market)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[#607084]">FT Score</dt>
          <dd className="font-semibold tabular-nums text-[#1c2838]">{scoreLabel}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[#607084]">Outcome</dt>
          <dd className="font-semibold text-[#1c2838]">{outcome ?? leg.outcome}</dd>
        </div>
      </dl>
    </article>
  );
}

function reasonText(reason: string): string {
  switch (reason) {
    case "leg-lost":
      return "No cashout: a leg on this ticket has lost.";
    case "in-play":
      return "Cashout is closed while a match on this ticket is being played.";
    case "no-live-price":
      return "Cashout unavailable: one of these markets is no longer priced.";
    case "too-small":
      return "The cashout value is too small to offer.";
    case "unavailable":
      return "Cashout is not enabled on this deployment yet.";
    default:
      return "Cashout is not available on this ticket.";
  }
}
