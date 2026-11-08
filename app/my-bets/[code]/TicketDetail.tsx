"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  ChevronsDown,
  IdCard,
  Trophy,
  CircleCheck,
  CircleX,
  Share2,
  LineChart,
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
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
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

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-24">
      <Header onBack={() => router.back()} />

      {/* Summary */}
      <section className="mx-3 mt-3 max-w-2xl rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-4 pb-4 pt-3 sm:mx-auto">
        <div className="mx-auto flex max-w-2xl items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span>
            {new Date(bet.created_at).toLocaleString("en-GB", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="capitalize text-[var(--text)]">{bet.mode}</span>
          <span className="ml-auto tracking-wider">Ticket {bet.code}</span>
          <button
            onClick={() => {
              copyText(bet.code).then((ok) => {
                setCopied(ok);
                if (ok) setTimeout(() => setCopied(false), 1600);
              });
            }}
            className="flex items-center gap-1 rounded bg-[var(--surface-2)] px-2 py-1 text-[11px] font-bold text-[var(--text)]"
          >
            {copied ? <Check size={12} strokeWidth={2.6} /> : <Copy size={12} strokeWidth={2} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mx-auto mt-3 flex max-w-2xl items-center justify-between">
          <span className="text-[15px] font-black capitalize text-[var(--text-bright)]">
            {bet.mode}
          </span>
          <span
            className="flex items-center gap-1 rounded-sm px-1.5 text-[11px] font-black uppercase leading-[18px]"
            style={{
              background: status.colour,
              color: bet.status === "pending" || bet.status === "cashed_out" ? "#3a2500" : "#ffffff",
            }}
          >
            {won && <Trophy size={12} strokeWidth={2.4} />}
            {status.label}
          </span>
        </div>

        {/* The return is the number a settled ticket is really about. */}
        <div className="mx-auto mt-2 max-w-2xl">
          <p className="text-[12px] text-[var(--text-muted)]">
            {settled ? "Total return" : "Potential return"}
          </p>
          <p
            className="text-[26px] font-black leading-tight tabular-nums"
            style={{ color: won ? "var(--win)" : "var(--text-bright)" }}
          >
            {formatMoney(
              settled ? Number(bet.payout ?? 0) : Number(bet.potential_win),
              bet.currency,
            )}
          </p>
        </div>

        <dl className="mx-auto mt-3 max-w-2xl space-y-1 border-t border-[var(--line)] pt-3 text-[13px]">
          <Line label="Stake" value={Number(bet.stake).toFixed(2)} />
          <Line label="Total odds" value={Number(bet.total_odds).toFixed(2)} />
          {Number(bet.bonus) > 0 && (
            <Line label="Bonus" value={Number(bet.bonus).toFixed(2)} accent />
          )}
          {!settled && <Line label="To return" value={Number(bet.potential_win).toFixed(2)} />}
        </dl>

        {/* Congratulations, on a won ticket only. */}
        {won && (
          <div className="mx-auto mt-3 flex max-w-2xl items-center gap-3 rounded border border-[var(--win)] bg-[var(--bg)] px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--win)] text-white">
              <Trophy size={18} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-black leading-tight text-[var(--text-bright)]">
                Winning ticket
              </span>
              <span className="block truncate text-[12px] font-medium text-[var(--text-muted)]">
                {data.owner?.name ?? player.name}
              </span>
            </span>
            <button
              onClick={showOff}
              className="flex shrink-0 items-center gap-1.5 rounded bg-[var(--accent)] px-3.5 py-2 text-[13px] font-black text-[var(--accent-ink)]"
            >
              {shared ? <Check size={14} strokeWidth={2.6} /> : <Share2 size={14} strokeWidth={2.2} />}
              {shared ? "Copied" : "Share"}
            </button>
          </div>
        )}

        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex items-center gap-1.5 rounded border border-[var(--line)] px-4 py-2 text-[13px] font-bold text-[var(--text)]"
          >
            {expanded ? "Hide selections" : "Show selections"}
            <ChevronsDown
              size={16}
              strokeWidth={2.4}
              style={{ transform: expanded ? "rotate(180deg)" : undefined }}
            />
          </button>
        </div>
      </section>

      {/* Legs */}
      {expanded && (
        <div className="mx-auto max-w-2xl space-y-2 px-3 py-3 sm:px-0">
          {selections.map((leg) => (
            <LegCard key={leg.id} leg={leg} />
          ))}
        </div>
      )}

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

/** The navy bar, matching the app shell's header. */
function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-[var(--chrome)]">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-3">
        <button onClick={onBack} aria-label="Back" className="rounded p-1 text-white hover:bg-white/10">
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
        <h1 className="flex-1 text-[16px] font-black text-white">Bet details</h1>
      </div>
    </header>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-bold tabular-nums" style={accent ? { color: "var(--accent)" } : undefined}>
        {value}
      </dd>
    </div>
  );
}

function LegCard({ leg }: { leg: Leg }) {
  const state =
    leg.result === "won"
      ? { label: "Won", colour: "var(--win)" }
      : leg.result === "lost"
        ? { label: "Lost", colour: "var(--lose)" }
        : leg.isLive
          ? { label: "Live", colour: "var(--live)" }
          : { label: "Not started", colour: "var(--text-faint)" };

  // A settled leg keeps the score it was judged on; an open one shows the
  // score right now, which is the whole reason to open a ticket mid-match.
  const settledScore = leg.final_home !== null && leg.final_away !== null;
  const homeScore = settledScore ? leg.final_home : (leg.liveHome ?? null);
  const awayScore = settledScore ? leg.final_away : (leg.liveAway ?? null);
  const showingLive = !settledScore && leg.liveHome !== null && leg.liveHome !== undefined;

  // What actually happened, where the final score says so plainly. Left blank
  // for markets whose result cannot be read off the scoreline alone — an
  // invented "Outcome" would be worse than none.
  const outcome = describeOutcome(leg);

  const drift =
    leg.currentOdds && Math.abs(leg.currentOdds - Number(leg.odds)) > 0.005
      ? leg.currentOdds < Number(leg.odds)
        ? "shortened"
        : "drifted"
      : null;

  return (
    <article className="flex overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
      {/* Status mark: a settled leg says at a glance whether it landed. */}
      <div
        className="flex w-9 shrink-0 items-start justify-center pt-3"
        style={{ background: "var(--surface)", color: state.colour }}
      >
        {leg.result === "won" ? (
          <CircleCheck size={19} strokeWidth={2.2} />
        ) : leg.result === "lost" ? (
          <CircleX size={19} strokeWidth={2.2} />
        ) : (
          <span className="h-2 w-2 rounded-full" style={{ background: state.colour }} />
        )}
      </div>

      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <span>
            {leg.kickoff
              ? new Date(leg.kickoff).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "-"}
          </span>
          <span className="capitalize">{leg.sport}</span>
          {leg.minuteLabel && (
            <span className="font-bold text-[var(--live)]">{leg.minuteLabel}</span>
          )}
          <span
            className="ml-auto rounded-sm px-1.5 text-[10px] font-black uppercase leading-[16px]"
            style={{ color: state.colour, boxShadow: `inset 0 0 0 1px ${state.colour}` }}
          >
            {leg.isLive ? "Live" : leg.result === "pending" ? "Not started" : state.label}
          </span>
        </div>

        <div className="mt-2 rounded bg-[var(--surface)] px-3 py-2">
          <Team name={leg.home_team} score={homeScore} live={showingLive} />
          <Team name={leg.away_team} score={awayScore} live={showingLive} />
        </div>

        {/* What the match finished, and what that made the outcome. */}
        {settledScore && (
          <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
            Full time:{" "}
            <span className="font-bold tabular-nums text-[var(--text)]">
              {leg.final_home}:{leg.final_away}
            </span>
          </p>
        )}

        <dl className="relative mt-2 space-y-1 rounded bg-[var(--surface)] px-3 py-2 text-[12px]">
          {leg.result === "won" && (
            <Trophy
              size={38}
              strokeWidth={1.4}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--win)] opacity-10"
            />
          )}
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Market</dt>
            <dd className="font-medium">{marketName(leg.market)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--text-muted)]">Pick</dt>
            <dd className="flex items-center gap-1 font-medium">
              {leg.outcome} @ {Number(leg.odds).toFixed(2)}
              {leg.result === "won" && (
                <Check size={12} strokeWidth={3} className="text-[var(--win)]" />
              )}
              {drift && (
                <span
                  className="ml-1 text-[10px]"
                  style={{ color: drift === "shortened" ? "var(--win)" : "var(--lose)" }}
                >
                  now {leg.currentOdds!.toFixed(2)}
                </span>
              )}
            </dd>
          </div>

          {outcome && (
            <div className="flex justify-between">
              <dt className="text-[var(--text-muted)]">Outcome</dt>
              <dd className="font-medium" style={{ color: state.colour }}>
                {outcome}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-2 flex items-center justify-between">
          <Link
            href={`/match/${leg.match_id}/tracker`}
            className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)]"
          >
            <LineChart size={13} strokeWidth={2} />
            Match tracker
          </Link>
          <Link
            href={`/match/${leg.match_id}`}
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] font-bold text-[var(--text)] ring-1 ring-[var(--line)]"
          >
            <IdCard size={13} strokeWidth={1.9} />
            Match details
          </Link>
        </div>
      </div>
    </article>
  );
}

function Team({ name, score, live }: { name: string; score: number | null; live?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="truncate text-[13px] text-[var(--text)]">{name}</span>
      <span
        className="pl-3 text-[13px] font-bold tabular-nums"
        style={{ color: live ? "var(--accent)" : "var(--text-muted)" }}
      >
        {score ?? "-"}
      </span>
    </div>
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
