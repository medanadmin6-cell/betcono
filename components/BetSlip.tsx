"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { X, Trash2, Settings, ReceiptText } from "lucide-react";
import { useSlip, useSession, type SlipMode, type SlipLeg } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { useSlipDocked } from "@/lib/wide";
import { BookedCode } from "@/components/BookedCode";
import { PlacedReceipt, type PlacedTicket } from "@/components/PlacedReceipt";
import {
  bonusFor,
  bonusAmount,
  combinationCount,
  systemSizes,
  QUALIFYING_ODDS,
} from "@/lib/bonus";

/**
 * The bet slip.
 *
 * Three ways to place the same selections: a single per pick, one multiple, or
 * a system covering every combination of a chosen size, with the accumulator
 * bonus shown on multiples.
 *
 * The same body renders two ways. On phones and narrow desktops it is a sheet
 * opened from the nav; on wide screens it is docked in the right rail
 * (`BetSlipPanel`). Only one is mounted at a time, so a placed-bet receipt is
 * never shown twice or lost to the other copy.
 *
 * Every price here is what the client last saw. The server re-prices each leg
 * from the live board on submit, so a stale slip is rejected rather than struck
 * at the wrong number.
 */

const TABS: { key: SlipMode; label: string }[] = [
  { key: "single", label: "Single" },
  { key: "multiple", label: "Multiple" },
  { key: "system", label: "System" },
];

const QUICK_STAKES = [5, 10, 20, 50, 100];

/** The sheet. Steps aside when the page has docked the slip in its rail. */
export function BetSlip() {
  const open = useSlip((s) => s.open);
  const setOpen = useSlip((s) => s.setOpen);
  const docked = useSlipDocked();

  if (!open || docked) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-label="Bet slip">
      <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-label="Close bet slip" />

      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-lg bg-[var(--bg-elevated)] pb-[env(safe-area-inset-bottom)] shadow-2xl md:mx-auto md:max-w-lg md:rounded-lg md:mb-6">
        <SlipBody onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}

/** The docked slip for the right rail on wide screens. */
export function BetSlipPanel() {
  return (
    <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
      <SlipBody />
    </div>
  );
}

function SlipBody({ onClose }: { onClose?: () => void }) {
  const {
    legs,
    stake,
    mode,
    systemSize,
    acceptOddsChanges,
    setOpen,
    setStake,
    setMode,
    setSystemSize,
    setAcceptOddsChanges,
    remove,
    clear,
    clearLegs,
  } = useSlip();

  const player = useSession((s) => s.player);
  const setBalance = useSession((s) => s.setBalance);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The placed slip keeps the legs it was built from, so the receipt can show
  // the selections back rather than only confirming.
  const [placed, setPlaced] = useState<{
    ticket: PlacedTicket;
    legs: SlipLeg[];
    lines: number;
    totalCost: number;
    oddsChanged: { match: string; from: number; to: number }[];
  } | null>(null);
  const [booked, setBooked] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const currency = player?.currency ?? "GHS";
  const oddsPerLeg = useMemo(() => legs.map((l) => l.odds), [legs]);

  // Multiple and System each need at least two selections. A slip that drops to
  // one (by removing legs, or by loading a one-leg code) falls back to a
  // single so the lone pick can still be staked, rather than stranding it in a
  // mode it cannot satisfy. The stored choice is untouched, so adding a second
  // selection restores it.
  const effectiveMode: SlipMode = legs.length < 2 ? "single" : mode;

  // What this slip becomes, and what it costs.
  const maths = useMemo(() => {
    const sizes = systemSizes(legs.length);
    const size = sizes.includes(systemSize) ? systemSize : (sizes[0] ?? 2);

    const lines =
      effectiveMode === "single"
        ? legs.length
        : effectiveMode === "system"
          ? combinationCount(legs.length, size)
          : 1;

    const totalOdds = legs.reduce((acc, l) => acc * l.odds, 1);
    const bonus =
      effectiveMode === "multiple" && legs.length >= 2 ? bonusAmount(stake, totalOdds, oddsPerLeg) : 0;

    const win =
      effectiveMode === "multiple"
        ? stake * totalOdds + bonus
        : effectiveMode === "single"
          ? legs.reduce((acc, l) => acc + stake * l.odds, 0)
          : // A system pays per line; the best case is every combination landing.
            stake * legs.reduce((acc, l) => acc * l.odds, 1);

    return {
      sizes,
      size,
      lines,
      totalOdds: Math.round(totalOdds * 100) / 100,
      bonus,
      win: Math.round(win * 100) / 100,
      cost: Math.round(stake * lines * 100) / 100,
    };
  }, [legs, effectiveMode, systemSize, stake, oddsPerLeg]);

  const standing = bonusFor(oddsPerLeg);

  const place = async () => {
    if (!player) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bets/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: player.id,
          stake,
          mode: effectiveMode,
          systemSize: maths.size,
          acceptOddsChanges,
          selections: legs.map((l) => ({
            matchId: l.matchId,
            market: l.market,
            outcome: l.outcome,
            odds: l.odds,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not place your bet");
        return;
      }
      setPlaced({
        ticket: json.ticket,
        // Captured before the slip is cleared.
        legs: [...legs],
        lines: json.lines,
        totalCost: json.totalCost,
        oddsChanged: json.oddsChanged ?? [],
      });
      if (typeof json.balance === "number") setBalance(json.balance);
      // Empty the slip but leave the sheet open: the receipt is the next thing
      // the player should see, and clear() would close it out from under them.
      clearLegs();
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const book = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player?.id ?? null, selections: legs, expiresInHours: 48 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not book your slip");
        return;
      }
      setBooked({ code: json.code, expiresAt: json.expiresAt ?? null });
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-4 py-3">
      <ReceiptText size={17} strokeWidth={2} className="text-[var(--accent)]" />
      <h2 className="text-[14px] font-black text-[var(--text-bright)]">Bet slip</h2>
      <span className="flex h-5 min-w-5 items-center justify-center rounded bg-[var(--accent)] px-1 text-[11px] font-black text-[var(--accent-ink)]">
        {legs.length}
      </span>
      {player && (
        <span className="ml-auto text-[12px] font-bold tabular-nums text-[var(--text-muted)]">
          {formatMoney(Number(player.balance), currency)}
        </span>
      )}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close bet slip"
          className={`${player ? "" : "ml-auto"} p-1 text-[var(--text-muted)]`}
        >
          <X size={18} strokeWidth={2} />
        </button>
      )}
    </div>
  );

  if (placed) {
    return (
      <>
        {header}
        <div className="min-h-0 overflow-y-auto">
          <PlacedReceipt
            ticket={placed.ticket}
            legs={placed.legs}
            lines={placed.lines}
            totalCost={placed.totalCost}
            oddsChanged={placed.oddsChanged}
            onDone={() => {
              setPlaced(null);
              setOpen(false);
            }}
          />
        </div>
      </>
    );
  }

  if (booked) {
    // The receipt stands alone: the legs it lists are its own body, so the
    // slip's list and controls make way rather than stacking under it.
    return (
      <>
        {header}
        <div className="min-h-0 overflow-y-auto">
          <BookedCode
            code={booked.code}
            expiresAt={booked.expiresAt}
            legs={legs}
            onDone={() => setBooked(null)}
          />
        </div>
      </>
    );
  }

  if (legs.length === 0) {
    return (
      <>
        {header}
        <EmptySlip />
      </>
    );
  }

  return (
    <>
      {header}

      {/* Mode tabs */}
      <div className="grid shrink-0 grid-cols-3 border-b border-[var(--line)]">
        {TABS.map((t) => {
          const disabled = t.key !== "single" && legs.length < 2;
          const active = effectiveMode === t.key;
          return (
            <button
              key={t.key}
              disabled={disabled}
              onClick={() => setMode(t.key)}
              className={`-mb-px border-b-2 py-2.5 text-[13px] font-bold disabled:opacity-30 ${
                active
                  ? "border-[var(--accent)] text-[var(--text-bright)]"
                  : "border-transparent text-[var(--text-muted)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {effectiveMode === "system" && maths.sizes.length > 0 && (
        <div className="scroll-x flex shrink-0 gap-1.5 px-4 pt-3">
          {maths.sizes.map((k) => (
            <button
              key={k}
              onClick={() => setSystemSize(k)}
              className="shrink-0 rounded px-3 py-1.5 text-[12px] font-bold"
              style={
                maths.size === k
                  ? { background: "var(--accent)", color: "var(--accent-ink)" }
                  : { background: "var(--surface-2)", color: "var(--text-muted)" }
              }
            >
              {k}/{legs.length}
              <span className="ml-1 font-normal opacity-70">({combinationCount(legs.length, k)})</span>
            </button>
          ))}
        </div>
      )}

      {/* Selections */}
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {legs.map((l) => (
          <li
            key={l.matchId}
            className="rounded border-l-2 border-[var(--accent)] bg-[var(--bg)] px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[var(--text-bright)]">{l.outcomeLabel}</p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">{l.marketLabel}</p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]">
                  {l.homeTeam} v {l.awayTeam}
                </p>
              </div>
              <span className="pt-px text-[14px] font-black tabular-nums text-[var(--text-bright)]">
                {l.odds.toFixed(2)}
              </span>
              <button
                onClick={() => remove(l.matchId)}
                aria-label={`Remove ${l.homeTeam} v ${l.awayTeam}`}
                className="-mr-1 p-0.5 text-[var(--text-faint)] hover:text-[var(--lose)]"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="shrink-0 border-t border-[var(--line)]">
        <div className="flex items-center justify-between px-4 pt-2.5">
          <button
            onClick={clear}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)]"
          >
            <Trash2 size={13} strokeWidth={2} />
            Remove all
          </button>
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            aria-expanded={settingsOpen}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)]"
          >
            Settings
            <Settings size={13} strokeWidth={2} />
          </button>
        </div>

        {settingsOpen && (
          <label className="mx-4 mt-2 flex items-start gap-2 rounded bg-[var(--surface)] p-3">
            <input
              type="checkbox"
              checked={acceptOddsChanges}
              onChange={(e) => setAcceptOddsChanges(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span className="text-[12px] leading-relaxed text-[var(--text-muted)]">
              Accept odds changes. With this off, a price that drifts before you submit will stop the
              bet instead of placing it at the new number.
            </span>
          </label>
        )}

        {/* Bonus progress, on multiples only */}
        {effectiveMode === "multiple" && (
          <p
            className="mx-4 mt-2.5 rounded px-3 py-2 text-[12px] font-semibold"
            style={
              standing.rate > 0
                ? { background: "var(--accent)", color: "var(--accent-ink)" }
                : { background: "var(--surface-2)", color: "var(--text-muted)" }
            }
          >
            {standing.rate > 0
              ? `${(standing.rate * 100).toFixed(0)}% bonus on ${standing.qualifying} selections`
              : `Add ${standing.toNext} more selection${standing.toNext === 1 ? "" : "s"} at ${QUALIFYING_ODDS.toFixed(2)}+ to earn a bonus`}
          </p>
        )}

        {/* Stake */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="slip-stake" className="text-[12px] font-semibold text-[var(--text-muted)]">
              {effectiveMode === "multiple" ? "Stake" : "Stake per line"}
            </label>
            <div className="flex items-center rounded border border-[var(--field-line)] bg-[var(--input)] focus-within:border-[var(--accent)]">
              <span className="pl-2.5 text-[11px] font-bold text-[var(--text-faint)]">{currency}</span>
              <input
                id="slip-stake"
                type="number"
                inputMode="decimal"
                min={1}
                value={stake || ""}
                onChange={(e) => setStake(Number(e.target.value))}
                className="w-24 bg-transparent px-2 py-1.5 text-right text-[14px] font-bold tabular-nums text-[var(--input-ink)] outline-none"
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {QUICK_STAKES.map((amount) => (
              <button
                key={amount}
                onClick={() => setStake(amount)}
                className="rounded py-1.5 text-[12px] font-bold tabular-nums"
                style={
                  stake === amount
                    ? { background: "var(--accent)", color: "var(--accent-ink)" }
                    : { background: "var(--surface-2)", color: "var(--text)" }
                }
              >
                {amount}
              </button>
            ))}
          </div>
        </div>

        {/* Totals */}
        <dl className="px-4 pt-2.5 text-[13px]">
          {maths.lines > 1 && (
            <Row
              label={effectiveMode === "system" ? `Lines (${maths.size}/${legs.length})` : "Lines"}
              value={`${maths.lines} × ${formatMoney(stake, currency)}`}
            />
          )}
          <Row label="Total odds" value={maths.totalOdds.toFixed(2)} />
          {effectiveMode === "multiple" && <Row label="Bonus" value={maths.bonus.toFixed(2)} />}
          <div className="flex items-baseline justify-between py-1.5">
            <dt className="font-bold text-[var(--text-bright)]">Potential win</dt>
            <dd className="text-[16px] font-black tabular-nums text-[var(--accent)]">
              {formatMoney(maths.win, currency)}
            </dd>
          </div>
        </dl>

        {error && (
          <p className="mx-4 mb-1 rounded bg-[var(--lose-bg)] px-3 py-2 text-[12px] text-[var(--lose)]">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="grid grid-cols-[1fr_2fr] gap-2 px-4 pb-4 pt-2">
          <button
            onClick={book}
            disabled={busy}
            className="rounded border border-[var(--line)] py-3 text-[13px] font-bold text-[var(--text)] disabled:opacity-50"
          >
            Book bet
          </button>

          {player ? (
            <button
              onClick={place}
              disabled={busy || stake <= 0}
              className="rounded bg-[var(--accent)] py-2 text-[var(--accent-ink)] disabled:opacity-50"
            >
              <span className="block text-[14px] font-black">{busy ? "Placing…" : "Place bet"}</span>
              <span className="block text-[11px] font-semibold opacity-80">
                Pay {formatMoney(maths.cost, currency)}
              </span>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center rounded bg-[var(--accent)] py-3 text-[14px] font-black text-[var(--accent-ink)]"
            >
              Log in to bet
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The empty slip doubles as the code box: a player who opened the slip with
 * nothing on it is very often holding a booking code someone sent them, so
 * pasting it here fills the slip without a trip to the Load Code page.
 */
function EmptySlip() {
  const load = useSlip((s) => s.load);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
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
      // The slip stays open: the point is seeing the selections land on it.
      load(json.booking.selections as SlipLeg[]);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 pb-6 pt-5">
      <p className="text-[13px] font-semibold text-[var(--text)]">Your slip is empty.</p>
      <p className="mt-1 text-[12px] text-[var(--text-muted)]">Tap any price on the board to add it here.</p>

      <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        Have a booking code?
      </p>
      <form onSubmit={submit} className="mt-2 flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
          aria-label="Booking code"
          className="min-w-0 flex-1 rounded border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-center text-[15px] font-black tracking-[0.2em] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          className="shrink-0 rounded bg-[var(--accent)] px-4 py-2.5 text-[13px] font-black text-[var(--accent-ink)] disabled:opacity-50"
        >
          {busy ? "…" : "Load"}
        </button>
      </form>

      {error && (
        <p className="mt-2 rounded bg-[var(--lose-bg)] px-3 py-2 text-[12px] text-[var(--lose)]">
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}
