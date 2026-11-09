"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronUp, ChevronDown, Clock, Trophy, X } from "lucide-react";
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
  won: { bg: "var(--win)", fg: "#ffffff", label: "Won" },
  lost: { bg: "var(--lose)", fg: "#ffffff", label: "Lost" },
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
    const initialRefresh = setTimeout(() => {
      void refreshDetails();
    }, 0);
    const timer = setInterval(refreshDetails, POLL_MS);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(timer);
    };
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
    { key: "cashout", label: "Cash out available" },
    { key: "live", label: "Live" },
  ];
  const historyFilters = [
    { key: "all", label: "All" },
    { key: "won", label: "Won" },
    { key: "lost", label: "Lost" },
    { key: "cashed_out", label: "Cashed out" },
  ];

  return (
    <Page>
      <div className="px-3 pt-4 md:mx-auto md:max-w-3xl md:px-5">
        <h1 className="text-[20px] font-black text-[var(--text-bright)]">
          {tab === "history" ? "Bet History" : "My bets"}
        </h1>

        <div className="mt-3 flex border-b border-[var(--line)]">
          {(
            [
              { key: "open", label: `Open (${open.length})` },
              { key: "history", label: "History" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setFilter("all");
              }}
              className={`-mb-px border-b-2 px-4 py-2.5 text-[14px] font-black transition-colors ${
                tab === t.key
                  ? "border-[var(--accent)] text-[var(--text-bright)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`space-y-3 px-3 pb-4 pt-3 md:mx-auto md:max-w-3xl md:px-5 ${tab === "history" ? "bg-[#eef2f6]" : ""}`}>
        {/* Filters */}
        <div
          className="scroll-x inline-flex max-w-full rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-0.5"
          role="tablist"
        >
          {(tab === "open" ? openFilters : historyFilters).map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap rounded-[4px] px-3 py-1.5 text-[12px] font-bold transition-colors ${
                filter === f.key
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Cashout banner */}
        {tab === "open" && anyCashout && !bannerDismissed && (
          <div className="rounded-md border border-[var(--accent)] bg-[var(--bg-elevated)] p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-black text-[var(--text-bright)]">
                Cash out is available on an open bet
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
              <div key={i} className="h-28 rounded-md bg-[var(--bg-elevated)] opacity-60" />
            ))}
          </div>
        ) : tab === "open" ? (
          shownOpen.length === 0 ? (
            <p className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-10 text-center text-[13px] text-[var(--text-muted)]">
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
          <p className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-10 text-center text-[13px] text-[var(--text-muted)]">
            No tickets here yet.
          </p>
        ) : (
          shownHistory.map((t) => (
            <HistoryTicketCard key={t.id} ticket={t} />
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
    <article className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <h3 className="text-[14px] font-black text-[var(--text-bright)]">
          {legs.length === 1 ? "Single" : `Multiple (${legs.length})`}
        </h3>
        <span className="rounded-sm bg-[var(--pending)] px-1.5 text-[10px] font-black uppercase leading-[16px] text-[#3a2500]">
          Open
        </span>
        <span className="ml-auto text-[11px] font-bold tracking-wider text-[var(--text-faint)]">
          {ticket.code}
        </span>
      </div>

      {expanded && (
        <ul className="divide-y divide-[var(--line)]">
          {legs.map((l) => {
            const live = Boolean(l.isLive);
            return (
              <li key={`${l.match_id}-${l.market}-${l.outcome}`} className="px-4 py-3">
                <div className="flex items-start gap-2.5">
                  <Clock size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--text-faint)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black text-[var(--text-bright)]">
                      {l.outcome}{" "}
                      <span className="tabular-nums">@ {Number(l.odds).toFixed(2)}</span>{" "}
                      <span className="font-semibold text-[var(--text-muted)]">
                        {marketName(l.market)}
                      </span>
                    </p>
                    {live && (
                      <span className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-[var(--lose)] px-1.5 text-[11px] font-black leading-[18px] tabular-nums text-white">
                        <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
                        Live {l.liveHome ?? 0}:{l.liveAway ?? 0}{" "}
                        {l.minuteLabel ? `${l.minuteLabel}` : ""}
                      </span>
                    )}
                    <p className="mt-1 text-[13px] font-semibold text-[var(--text)]">
                      {l.home_team} <span className="font-normal text-[var(--text-faint)]">v</span>{" "}
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
        aria-expanded={expanded}
        className="flex w-full items-center justify-end gap-1 px-4 py-2 text-[12px] font-bold text-[var(--text-muted)]"
      >
        {expanded ? "Hide selections" : "Show selections"}
        {expanded ? (
          <ChevronUp size={14} strokeWidth={2.4} />
        ) : (
          <ChevronDown size={14} strokeWidth={2.4} />
        )}
      </button>

      <dl className="space-y-1 border-t border-[var(--line)] px-4 py-2.5 text-[13px]">
        <div className="flex items-center justify-between">
          <dt className="text-[var(--text-muted)]">Stake</dt>
          <dd className="font-bold tabular-nums text-[var(--text-bright)]">
            {Number(ticket.stake).toFixed(2)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-[var(--text-muted)]">Potential win</dt>
          <dd className="font-black tabular-nums text-[var(--accent)]">
            {Number(ticket.potential_win).toFixed(2)}
          </dd>
        </div>
      </dl>

      {offer?.available ? (
        <div className="px-4 pb-3">
          <button
            onClick={onCashout}
            className="w-full rounded bg-[var(--accent)] py-2.5 text-[14px] font-black tabular-nums text-[var(--accent-ink)]"
          >
            Cash out {formatMoney(offer.amount, ticket.currency)}
          </button>
        </div>
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

const HISTORY_BAR: Record<string, string> = {
  won: "#1b9a4b",
  lost: "#d64545",
  cashed_out: "#c48a12",
  void: "#5c6b7a",
  pending: "#1b6ca8",
};

function HistoryTicketCard({ ticket }: { ticket: Ticket }) {
  const when = new Date(ticket.created_at);
  const day = when.toLocaleDateString("en-GB", { day: "2-digit" });
  const month = when.toLocaleDateString("en-GB", { month: "short" });
  const style = STATUS_STYLE[ticket.status] ?? STATUS_STYLE.pending;
  const bar = HISTORY_BAR[ticket.status] ?? HISTORY_BAR.pending;
  const returned = Number(ticket.payout ?? ticket.potential_win);
  const paid = ticket.status === "won" || ticket.status === "cashed_out";

  return (
    <Link href={`/my-bets/${ticket.code}`} className="flex items-stretch gap-2">
      <div className="flex w-9 shrink-0 flex-col items-center justify-center leading-none text-[#243044]">
        <span className="text-[16px] font-black">{day}</span>
        <span className="mt-0.5 text-[12px] font-semibold text-[#6b7c90]">{month}</span>
      </div>

      <article className="min-w-0 flex-1 overflow-hidden rounded-md bg-white shadow-sm">
        <div className="flex items-center justify-between px-3 py-2 text-white" style={{ background: bar }}>
          <span className="text-[14px] font-bold">
            {ticket.selections.length <= 1 ? "Single" : "Multiple"}
          </span>
          <span className="flex items-center gap-1 text-[13px] font-bold">
            {ticket.status === "won" && <Trophy size={14} strokeWidth={2.2} />}
            {style.label}
            <ChevronRight size={16} strokeWidth={2.4} />
          </span>
        </div>

        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between text-[13px] text-[#4b5563]">
            <span>Total Stake ({ticket.currency})</span>
            <span className="font-semibold tabular-nums text-[#1f2937]">
              {Number(ticket.stake).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[13px]">
            <span className="text-[#4b5563]">{paid ? "Total Return" : "To Return"}</span>
            <span
              className="font-bold tabular-nums"
              style={{ color: paid ? "#1b9a4b" : "#1f2937" }}
            >
              {returned.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <ul className="mt-2 space-y-0.5">
            {ticket.selections.map((leg) => (
              <li
                key={`${leg.match_id}-${leg.market}-${leg.outcome}`}
                className="truncate text-[12px] text-[#8b97a6]"
              >
                {leg.home_team} v {leg.away_team}
              </li>
            ))}
          </ul>
        </div>
      </article>
    </Link>
  );
}
