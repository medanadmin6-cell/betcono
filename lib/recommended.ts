import { db } from "./supabase";
import { getFeed, type FeedMatch } from "./fixtures";
import { bookingCode } from "./codes";
import type { SlipLeg } from "./store";

/**
 * The AI picks: ready-made accumulators behind real booking codes.
 *
 * Each card is an ordinary bookings row, so "add to betslip" and shared
 * links ride the existing load-code path and a code keeps working after the
 * home page has moved on. The generated set is cached in app_settings and
 * rebuilt when it ages out or its first kickoff passes, so every visitor
 * sees the same codes — a code players can talk about is the point.
 */

export interface RecommendedCard {
  code: string;
  title: string;
  totalOdds: number;
  legs: SlipLeg[];
}

interface CacheShape {
  generatedAt: string;
  items: RecommendedCard[];
}

const SETTINGS_KEY = "recommended_codes";
const MAX_AGE_MS = 6 * 3_600_000;

/** The match-result market, whichever source priced it. */
function resultMarket(match: FeedMatch) {
  return match.markets.find((m) => m.key === "1x2" || m.key === "af1") ?? null;
}

/** The favourite: the shortest price on the result market. */
function favourite(match: FeedMatch): SlipLeg | null {
  const market = resultMarket(match);
  if (!market || market.prices.length < 2) return null;
  const best = [...market.prices].sort((a, b) => a.odds - b.odds)[0];
  if (!best || !Number.isFinite(best.odds) || best.odds <= 1) return null;
  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    league: match.league,
    kickoff: match.kickoff,
    market: market.key,
    marketLabel: market.label,
    outcome: best.outcome,
    outcomeLabel: best.label,
    odds: best.odds,
  };
}

interface Recipe {
  title: string;
  size: number;
  min: number;
  max: number;
}

/** Short, mid and long builds, the spread a recommendations rail shows. */
const RECIPES: Recipe[] = [
  { title: "Banker picks", size: 3, min: 1.1, max: 1.6 },
  { title: "Solid five", size: 5, min: 1.25, max: 2.0 },
  { title: "Big odds builder", size: 7, min: 1.4, max: 2.8 },
];

function build(feed: FeedMatch[]): Omit<RecommendedCard, "code">[] {
  const now = Date.now();
  const candidates = feed
    .filter(
      (m) =>
        !m.isLive &&
        !m.isLocked &&
        !m.postponed &&
        new Date(m.kickoff).getTime() > now + 30 * 60_000,
    )
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
    .slice(0, 80);

  const cards: Omit<RecommendedCard, "code">[] = [];
  const used = new Set<string>();

  for (const recipe of RECIPES) {
    const legs: SlipLeg[] = [];
    // Two passes: fresh matches first, then reuse if the board is thin.
    for (const allowReuse of [false, true]) {
      for (const match of candidates) {
        if (legs.length >= recipe.size) break;
        if (!allowReuse && used.has(match.id)) continue;
        if (legs.some((l) => l.matchId === match.id)) continue;
        const leg = favourite(match);
        if (!leg || leg.odds < recipe.min || leg.odds > recipe.max) continue;
        legs.push(leg);
      }
      if (legs.length >= recipe.size) break;
    }
    if (legs.length < Math.min(3, recipe.size)) continue;

    for (const l of legs) used.add(l.matchId);
    const totalOdds = legs.reduce((acc, l) => acc * l.odds, 1);
    cards.push({ title: recipe.title, legs, totalOdds: Math.round(totalOdds * 100) / 100 });
  }

  return cards;
}

function stale(cache: CacheShape | null): boolean {
  if (!cache?.items?.length) return true;
  if (Date.now() - new Date(cache.generatedAt).getTime() > MAX_AGE_MS) return true;
  // The set dies with its first kickoff, so a card never shows a started leg.
  const first = Math.min(
    ...cache.items.flatMap((c) => c.legs.map((l) => new Date(l.kickoff).getTime())),
  );
  return first <= Date.now();
}

export async function getRecommendedCards(): Promise<RecommendedCard[]> {
  const supabase = db();
  if (!supabase) return [];

  const { data: row } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  let cache: CacheShape | null = null;
  try {
    cache = row?.value ? (JSON.parse(row.value) as CacheShape) : null;
  } catch {
    cache = null;
  }

  if (!stale(cache)) return cache!.items;

  const feed = await getFeed().catch(() => [] as FeedMatch[]);
  const built = build(feed);
  const items: RecommendedCard[] = [];

  for (const card of built) {
    const code = bookingCode();
    const expiresAt = new Date(
      Math.min(...card.legs.map((l) => new Date(l.kickoff).getTime())),
    ).toISOString();
    const { error } = await supabase.from("bookings").insert({
      code,
      selections: card.legs,
      created_by: null,
      expires_at: expiresAt,
    });
    if (error) {
      console.error("[recommended] booking insert failed", error);
      continue;
    }
    items.push({ ...card, code });
  }

  // A thin board keeps the old set alive rather than publishing nothing.
  if (!items.length) return cache?.items ?? [];

  const next: CacheShape = { generatedAt: new Date().toISOString(), items };
  await supabase
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() });

  return items;
}
