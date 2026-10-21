import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Real football headlines from BBC Sport's public RSS feed, cached
 * in-process so the feed is asked at most every fifteen minutes however
 * many players open the home page.
 */

const FEED_URL = "https://feeds.bbci.co.uk/sport/football/rss.xml";
const TTL_MS = 15 * 60_000;

interface NewsItem {
  title: string;
  link: string;
  published: string;
}

let cache: { at: number; items: NewsItem[] } | null = null;

function text(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .trim();
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ items: cache.items });
  }

  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": "BetCono/1.0" },
      next: { revalidate: 900 },
    });
    const xml = await res.text();
    const items: NewsItem[] = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1];
      const title = text(block, "title");
      const link = text(block, "link");
      if (!title || !link.startsWith("http")) continue;
      items.push({ title, link, published: text(block, "pubDate") });
      if (items.length >= 8) break;
    }
    if (items.length) cache = { at: Date.now(), items };
    return NextResponse.json({ items: cache?.items ?? [] });
  } catch (err) {
    console.error("[news]", err);
    return NextResponse.json({ items: cache?.items ?? [] });
  }
}
