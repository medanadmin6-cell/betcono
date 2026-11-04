"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, MonitorPlay, RefreshCw } from "lucide-react";
import type { FeedMatch } from "@/lib/fixtures";
import type { TrackerEvent, TrackerStat } from "@/lib/tracker";
import { PitchTracker } from "@/components/PitchTracker";
import { Page } from "@/components/Shell";
import { BallIcon } from "@/components/icons";

const POLL_MS = 20_000;

interface Payload {
  match: FeedMatch | null;
  events: TrackerEvent[];
  stats: TrackerStat[];
}

/**
 * The match tracker.
 *
 * A timeline down the middle with each side's events on their own half, so the
 * shape of a match reads at a glance: who scored, when, and who is in trouble.
 * Statistics are frequently absent from the feed, so they appear only when the
 * numbers actually arrive rather than as a row of dashes.
 */
export function TrackerView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(`/api/match/${encodeURIComponent(id)}/tracker`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(json.error ?? "Could not load the tracker");
          return;
        }
        setData(json);
        setError(null);
      } catch {
        if (alive) setError("Could not load the tracker");
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, nonce]);

  // Keep it current while the match is running.
  useEffect(() => {
    if (!data?.match?.isLive) return;
    const timer = setInterval(() => setNonce((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [data?.match?.isLive]);

  const match = data?.match ?? null;

  // Possession is read from the statistics the feed reports, and is simply
  // absent for most matches in play.
  const possession = (() => {
    const row = data?.stats.find((s) => s.label.toLowerCase().includes("possession"));
    if (!row) return null;
    const num = (v: string | number | null) => Number(String(v ?? "").replace("%", ""));
    const h = num(row.home);
    const a = num(row.away);
    if (!Number.isFinite(h) || !Number.isFinite(a) || h + a === 0) return null;
    return { home: Math.round(h), away: Math.round(a) };
  })();

  return (
    <Page>
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 pt-3">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="-ml-1 rounded p-1 text-[var(--text-bright)] hover:bg-[var(--surface)]"
        >
          <ArrowLeft size={20} strokeWidth={2} />
        </button>
        <h1 className="flex-1 text-[20px] font-black text-[var(--text-bright)]">Match tracker</h1>
        <button
          onClick={() => setNonce((n) => n + 1)}
          aria-label="Refresh"
          className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)]"
        >
          <RefreshCw size={16} strokeWidth={2} />
        </button>
      </div>

      {error ? (
        <div className="p-10 text-center">
          <p className="text-[14px] text-[var(--text-muted)]">{error}</p>
          <Link
            href={`/match/${id}`}
            className="mt-4 inline-block rounded bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
          >
            Match details
          </Link>
        </div>
      ) : !data ? (
        <div className="mx-auto max-w-2xl animate-pulse space-y-2 p-3">
          <div className="h-28 rounded-md bg-[var(--bg-elevated)]" />
          <div className="h-56 rounded-md bg-[var(--bg-elevated)]" />
        </div>
      ) : (
        <div className="mx-auto max-w-2xl pb-6">
          {match && (
            <>
              <section className="mx-3 mt-3 flex items-center justify-between gap-2 rounded-md bg-[var(--chrome)] px-4 py-4">
                <Side name={match.homeTeam} crest={match.homeCrest} />
                <div className="shrink-0 text-center">
                  <p className="text-[11px] font-semibold text-white/60">
                    {match.country ? `${match.country} · ` : ""}
                    {match.league}
                  </p>
                  <p
                    className="mt-0.5 flex items-center justify-center gap-1 text-[13px] font-black"
                    style={{ color: match.isLive ? "#ff5a52" : "rgba(255,255,255,0.65)" }}
                  >
                    {match.isLive && <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#ff5a52]" />}
                    {match.isLive ? match.minuteLabel : "Not started"}
                  </p>
                </div>
                <Side name={match.awayTeam} crest={match.awayCrest} />
              </section>

              <div className="p-3">
                <PitchTracker
                  events={data.events}
                  homeTeam={match.homeTeam}
                  awayTeam={match.awayTeam}
                  scoreHome={match.scoreHome ?? 0}
                  scoreAway={match.scoreAway ?? 0}
                  minuteLabel={match.minuteLabel}
                  isLive={match.isLive}
                  possession={possession}
                />
              </div>
            </>
          )}

          <h2 className="px-4 pb-2 pt-3 text-[15px] font-black text-[var(--text-bright)]">Timeline</h2>

          {!data.events.length ? (
            <p className="mx-3 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-8 text-center text-[13px] text-[var(--text-muted)]">
              Nothing has happened yet.
            </p>
          ) : (
            <ol className="relative mx-4">
              {/* The spine the events hang off. */}
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--line)]" />
              {data.events.map((e, i) => (
                <TimelineRow key={`${e.minute}-${i}`} event={e} />
              ))}
            </ol>
          )}

          {/* Statistics, only where the feed actually has them. */}
          {data.stats.length > 0 && (
            <>
              <h2 className="px-4 pb-2 pt-6 text-[15px] font-black text-[var(--text-bright)]">
                Statistics
              </h2>
              <div className="mx-3 space-y-3 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
                {data.stats.map((s) => (
                  <StatRow key={s.label} stat={s} />
                ))}
              </div>
            </>
          )}

          <div className="px-3 pt-6">
            <Link
              href={`/match/${id}`}
              className="block rounded bg-[var(--accent)] py-3 text-center text-[13px] font-black text-[var(--accent-ink)]"
            >
              Match details and odds
            </Link>
          </div>
        </div>
      )}
    </Page>
  );
}

function Side({ name, crest }: { name: string; crest: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <Image
        src={crest || "/crest-fallback.svg"}
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 object-contain"
        unoptimized
      />
      <span className="line-clamp-2 text-center text-[12px] font-bold leading-tight text-white">
        {name}
      </span>
    </div>
  );
}

/** One drawn mark per event kind, so the timeline needs no emoji. */
function EventMark({ kind }: { kind: string }) {
  if (kind === "goal") return <BallIcon size={14} strokeWidth={2} />;
  if (kind === "card") return <span className="block h-3 w-2 rounded-[1px] bg-current" />;
  if (kind === "sub") return <ArrowLeftRight size={12} strokeWidth={2.4} />;
  if (kind === "var") return <MonitorPlay size={12} strokeWidth={2.2} />;
  return <span className="block h-1.5 w-1.5 rounded-full bg-current" />;
}

function TimelineRow({ event }: { event: TrackerEvent }) {
  const home = event.side === "home";
  const red = event.detail.toLowerCase().includes("red");

  const body = (
    <div
      className="max-w-[46%] rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2"
      style={{ textAlign: home ? "right" : "left" }}
    >
      <p className="text-[12px] font-semibold text-[var(--text)]">{event.player ?? event.detail}</p>
      {(event.player || event.assist) && (
        <p className="text-[11px] text-[var(--text-muted)]">
          {event.player ? event.detail : ""}
          {event.assist ? ` · ${event.assist}` : ""}
        </p>
      )}
    </div>
  );

  const badge =
    event.kind === "goal"
      ? { background: "var(--accent)", color: "var(--accent-ink)" }
      : event.kind === "card"
        ? { background: "var(--surface-2)", color: red ? "var(--lose)" : "var(--pending)" }
        : { background: "var(--surface-2)", color: "var(--text)" };

  return (
    <li className="relative flex items-center justify-between py-2">
      {home ? body : <span className="max-w-[46%] flex-1" />}

      <span className="z-10 flex shrink-0 flex-col items-center px-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={badge}
        >
          <EventMark kind={event.kind} />
        </span>
        <span className="mt-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
          {event.minute}
          {event.extra ? `+${event.extra}` : ""}
        </span>
      </span>

      {home ? <span className="max-w-[46%] flex-1" /> : body}
    </li>
  );
}

function StatRow({ stat }: { stat: TrackerStat }) {
  const toNumber = (v: string | number | null): number => {
    if (v === null) return 0;
    const n = Number(String(v).replace("%", ""));
    return Number.isFinite(n) ? n : 0;
  };

  const h = toNumber(stat.home);
  const a = toNumber(stat.away);
  const total = h + a;
  const share = total > 0 ? (h / total) * 100 : 50;

  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-bold tabular-nums text-[var(--text)]">{stat.home ?? "-"}</span>
        <span className="text-[var(--text-muted)]">{stat.label}</span>
        <span className="font-bold tabular-nums text-[var(--text)]">{stat.away ?? "-"}</span>
      </div>
      <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span className="h-full bg-[var(--accent)]" style={{ width: `${share}%` }} />
        <span className="h-full bg-[var(--hint)]" style={{ width: `${100 - share}%` }} />
      </div>
    </div>
  );
}
