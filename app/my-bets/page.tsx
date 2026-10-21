"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronUp, ChevronDown, Clock, X } from "lucide-react";
import { Page } from "@/components/Shell";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { marketName } from "@/lib/markets";
import { WinCelebration, hasCelebrated, markCelebrated } from "@/components/WinCelebration";

interface Leg {
  match_id: string;
  home_team: string;
  away_team: string;
  market: string;
  outcome: string;
  odds: number;
  result: string;
  final_home: number | null;
  final_away: number | null;
}

interface Ticket {
  id: string;
  code: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  currency: string;
  status: string;
  payout: number | null;
  settled_at: string | null;
  created_at: string;
  selections: Leg[];
}

/** The live view of one pending ticket, from its detail endpoint. */
interface LiveDetail {
  cashout: { available: boolean; amount: number; reason?: string };
  selections: (Leg & {
    kickoff?: string | null;
    isLive?: boolean;
    liveHome?: number | null;
    liveAway?: number | null;
    minuteLabel?: string | null;
  })[];
}

const POLL_MS = 30_000;

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "var(--pending)", fg: "#3a2500", label: "Open" },
  won: { bg: "var(--win)", fg: "#052e16", label: "Won" },
  lost: { bg: "var(--lose)", fg: "#450a12", label: "Lost" },
  cashed_out: { bg: "var(--pending)", fg: "#3a2500", label: "Cashed out" },
  void: { bg: "var(--surface-2)", fg: "var(--text)", label: "Void" },
};

export default function MyBetsPage() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [details, setDetails] = useState<Record<string, LiveDetail>>({});
  const [tab, setTab] = useState<"open" | "history">("open");
  const [filter, setFilter] = useState("all");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // The first winning ticket the player has not been shown yet.
  const [celebrating, setCelebrating] = useState<Ticket | null>(null);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    // Opening this screen settles this player's own tickets first.
    fetch(`/api/bets/mine?userId=${player.id}`)
      .then((r) => (r.ok ? r.json() : { bets: [] }))
      .then((j) => {
        const bets: Ticket[] = j.bets ?? [];
        setTickets(bets);

        const fresh = bets.find((b) => b.status === "won" && !hasCelebrated(b.code));
        if (fresh && markCelebrated(fresh.code)) setCelebrating(fresh);
      })
      .catch(() => setTickets([]));
  }, [player]);

  /** Pending tickets carry a live score and a cashout price, both of which
      move on their own, so each one polls its detail endpoint. */
  const refreshDetails = useCallback(async () => {
    if (!player || !tickets) return;
    const open = tickets.filter((t) => t.status === "pending");
    if (!open.length) return;
    const results = await Promise.all(
      open.map(async (t) => {
        try {
          const res = await fetch(`/api/bets/${t.code}?userId=${player.id}`);
          if (!res.ok) return null;
          const json = await res.json();
          return [t.code, { cashout: json.cashout, selections: json.selections }] as const;
        } catch {
          return null;
        }
      }),
    );
    setDetails((prev) => {
      const next = { ...prev };
      for (const r of results) if (r) next[r[0]] = r[1];
      return next;
    });
  }, [player, tickets]);

  useEffect(() => {
    refreshDetails();
    const timer = setInterval(refreshDetails, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshDetails]);

  const cashout = useCallback(
    async (ticket: Ticket) => {
      const offer = details[ticket.code]?.cashout;
      if (!player || !offer?.available) return;
      try {
        const res = await fetch(`/api/bets/${ticket.code}/cashout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: player.id, expected: offer.amount }),
        });
        const json = await res.json();
        if (!res.ok) {
          // A moved price comes back with the new number; show it next poll.
          await refreshDetails();
          return;
        }
        if (typeof json.balance === "number") setBalance(json.balance);
        setTickets(
          (prev) =>
            prev?.map((t) =>
              t.code === ticket.code
                ? { ...t, status: "cashed_out", payout: json.amount }
                : t,
            ) ?? prev,
        );
      } catch {
        /* the next poll redraws the true state */
      }
    },
    [details, player, refreshDetails, setBalance],
  );

  const open = useMemo(() => tickets?.filter((t) => t.status === "pending") ?? [], [tickets]);
  const history = useMemo(() => tickets?.filter((t) => t.status !== "pending") ?? [], [tickets]);

  const shownOpen = useMemo(() => {
    if (filter === "cashout") return open.filter((t) => details[t.code]?.cashout.available);
    if (filter === "live")
      return open.filter((t) => details[t.code]?.selections.some((l) => l.isLive));
    return open;
  }, [open, filter, details]);

  const shownHistory = useMemo(
    () => (filter === "all" ? history : history.filter((t) => t.status === filter)),
    [history, filter],
  );

  const anyCashout = open.some((t) => details[t.code]?.cashout.available);

  if (!player) return null;

  const openFilters = [
    { key: "all", label: "All" },
    { key: "cashout", label: "Cashout Available" },
    { key: "live", label: "Live Games" },
  ];
  const historyFilters = [
    { key: "all", label: "All" },
    { key: "won", label: "Won" },
    { key: "lost", label: "Lost" },
    { key: "cashed_out", label: "Cashed out" },
  ];

  return (
    <Page>
      {/* File tabs, attached to the content below them */}
      <div className="flex items-end gap-1 px-2 pt-3 md:px-5">
        {(
          [
            { key: "open", label: `Open Bets (${open.length})` },
            { key: "history", label: "Bet History" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setFilter("all");
            }}
            className={`rounded-t-xl px-5 py-3 text-[14px] font-black transition-colors ${
              tab === t.key
                ? "bg-[var(--bg-elevated)] text-[var(--text-bright)]"
                : "bg-[var(--surface-3)] text-[var(--text-muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 bg-[var(--bg-elevated)] px-2 pb-4 pt-3 md:px-5">
        {/* Filter chips */}
        <div className="scroll-x flex gap-1.5">
          {(tab === "open" ? openFilters : historyFilters).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap rounded-xl border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                filter === f.key
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--bg)] text-[var(--text)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Cashout banner */}
        {tab === "open" && anyCashout && !bannerDismissed && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[16px] font-black text-[var(--text-bright)]">
                Cashout available now!
              </p>
              <button
                onClick={() => setBannerDismissed(true)}
                aria-label="Dismiss"
                className="text-[var(--text-muted)]"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-[12px] text-[var(--text-muted)]">
                Settle your open ticket early and take the offer.
              </p>
              <Link
                href="/how-to-play"
                className="shrink-0 text-[12px] font-bold text-[var(--accent)]"
              >
                How it works
              </Link>
            </div>
          </div>
        )}

        {tickets === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-[var(--bg)] opacity-60" />
            ))}
          </div>
        ) : tab === "open" ? (
          shownOpen.length === 0 ? (
            <p className="rounded-xl bg-[var(--bg)] p-10 text-center text-[var(--text-muted)]">
              No open bets here.
            </p>
          ) : (
            shownOpen.map((t) => (
              <OpenTicketCard
                key={t.id}
                ticket={t}
                detail={details[t.code]}
                onCashout={() => cashout(t)}
              />
            ))
          )
        ) : shownHistory.length === 0 ? (
          <p className="rounded-xl bg-[var(--bg)] p-10 text-center text-[var(--text-muted)]">
            No tickets here yet.
          </p>
        ) : (
          shownHistory.map((t) => (
            <HistoryTicketCard key={t.id} ticket={t} onCelebrate={setCelebrating} />
          ))
        )}
      </div>

      {celebrating && (
        <WinCelebration
          code={celebrating.code}
          amount={Number(celebrating.payout ?? celebrating.potential_win)}
          currency={celebrating.currency}
          onClose={() => setCelebrating(null)}
        />
      )}
    </Page>
  );
}

// -------------------------------------------------------------- open card

function OpenTicketCard({
  ticket,
  detail,
  onCashout,
}: {
  ticket: Ticket;
  detail?: LiveDetail;
  onCashout: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const legs: LiveDetail["selections"] = detail?.selections ?? ticket.selections;
  const offer = detail?.cashout;

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg)]">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h3 className="text-[16px] font-black text-[var(--text-bright)]">
          {legs.length === 1 ? "Singles" : `Multiple (${legs.length})`}
        </h3>
      </div>

      {expanded && (
        <ul className="divide-y divide-[var(--line)]">
          {legs.map((l) => {
            const live = Boolean(l.isLive);
            return (
              <li key={`${l.match_id}-${l.market}-${l.outcome}`} className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <Clock size={17} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-black text-[var(--text-bright)]">
                      {l.outcome} @ {Number(l.odds).toFixed(2)}{" "}
                      <span className="font-semibold text-[var(--text-muted)]">
                        {marketName(l.market)}
                      </span>
                    </p>
                    {live && (
                      <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[var(--lose)] px-2 py-0.5 text-[12px] font-black italic text-white">
                        <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
                        LIVE {l.liveHome ?? 0}:{l.liveAway ?? 0}{" "}
                        {l.minuteLabel ? `${l.minuteLabel}` : ""}
                      </span>
                    )}
                    <p className="mt-1 text-[14px] font-bold text-[var(--text-bright)] underline decoration-[var(--text-faint)] underline-offset-2">
                      {l.home_team} <span className="font-normal text-[var(--text-muted)]">vs</span>{" "}
                      {l.away_team}
                    </p>
                    {l.kickoff && (
                      <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                        {new Date(l.kickoff).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-end gap-1 px-4 py-2.5 text-[13px] font-bold text-[var(--text)]"
      >
        {expanded ? "Hide Match Details" : "Show Match Details"}
        {expanded ? (
          <ChevronUp size={15} strokeWidth={2.4} />
        ) : (
          <ChevronDown size={15} strokeWidth={2.4} />
        )}
      </button>

      <dl className="space-y-1.5 border-t border-[var(--line)] px-4 py-3 text-[15px]">
        <div className="flex items-center justify-between">
          <dt className="text-[var(--text)]">Stake</dt>
          <dd className="font-semibold text-[var(--text-bright)]">
            {Number(ticket.stake).toFixed(2)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[var(--text)]">Pot. Win</dt>
          <dd className="font-black text-[var(--accent)]">
            {Number(ticket.potential_win).toFixed(2)}
          </dd>
        </div>
      </dl>

      {offer?.available ? (
        <button
          onClick={onCashout}
          className="w-full bg-[var(--accent)] py-3.5 text-[15px] font-black text-[var(--accent-ink)]"
        >
          Cashout {formatMoney(offer.amount, ticket.currency)}
        </button>
      ) : (
        <Link
          href={`/my-bets/${ticket.code}`}
          className="flex w-full items-center justify-center gap-1 border-t border-[var(--line)] py-2.5 text-[12px] font-bold text-[var(--accent)]"
        >
          View bet details
          <ChevronRight size={14} strokeWidth={2.5} />
        </Link>
      )}
    </article>
  );
}

// ----------------------------------------------------------- history card

function HistoryTicketCard({
  ticket,
  onCelebrate,
}: {
  ticket: Ticket;
  onCelebrate: (t: Ticket) => void;
}) {
  const style = STATUS_STYLE[ticket.status] ?? STATUS_STYLE.pending;
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-black tracking-wider text-[var(--accent)]">{ticket.code}</p>
          <p className="text-[11px] text-[var(--text-faint)]">
            {ticket.selections.length} leg{ticket.selections.length === 1 ? "" : "s"} ·{" "}
            {new Date(ticket.created_at).toLocaleDateString()}
          </p>
        </div>
        <span
          className="rounded-lg px-2 py-0.5 text-[10px] font-black uppercase"
          style={{ background: style.bg, color: style.fg }}
        >
          {style.label}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <dt className="text-[10px] text-[var(--text-faint)]">Stake</dt>
          <dd className="font-bold">{formatMoney(Number(ticket.stake), ticket.currency)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-[var(--text-faint)]">Odds</dt>
          <dd className="font-bold">{Number(ticket.total_odds).toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-[var(--text-faint)]">
            {ticket.status === "won" || ticket.status === "cashed_out" ? "Paid out" : "To win"}
          </dt>
          <dd className="font-bold text-[var(--accent)]">
            {formatMoney(Number(ticket.payout ?? ticket.potential_win), ticket.currency)}
          </dd>
        </div>
      </dl>
    </>
  );

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg)]">
      {ticket.status === "won" ? (
        <button
          onClick={() => onCelebrate(ticket)}
          className="block w-full px-4 py-3 text-left"
          aria-label={`You won on ticket ${ticket.code}`}
        >
          {inner}
        </button>
      ) : (
        <Link href={`/my-bets/${ticket.code}`} className="block w-full px-4 py-3 text-left">
          {inner}
        </Link>
      )}

      <Link
        href={`/my-bets/${ticket.code}`}
        className="flex w-full items-center justify-center gap-1 border-t border-[var(--line)] py-2.5 text-[12px] font-bold text-[var(--accent)]"
      >
        View bet details
        <ChevronRight size={14} strokeWidth={2.5} />
      </Link>
    </article>
  );
}
