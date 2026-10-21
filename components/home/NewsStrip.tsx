"use client";

import { useEffect, useState } from "react";
import { Newspaper, ExternalLink } from "lucide-react";

/** Real football headlines, from BBC Sport's feed via /api/news. */

interface NewsItem {
  title: string;
  link: string;
  published: string;
}

function when(published: string): string {
  const t = new Date(published).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(1, Math.round((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NewsStrip() {
  const [items, setItems] = useState<NewsItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/news")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setItems(j.items ?? []);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!items?.length) return null;

  return (
    <section className="mx-2.5 mb-4 mt-4 md:mx-5">
      <div className="mb-2 flex items-center gap-2">
        <Newspaper size={15} className="text-[var(--accent)]" />
        <h2 className="text-[14px] font-black uppercase tracking-tight text-[var(--text-bright)]">
          Football News
        </h2>
        <span className="text-[10px] font-bold text-[var(--text-faint)]">via BBC Sport</span>
      </div>

      <div className="overflow-hidden rounded-xl bg-[var(--bg-elevated)] ring-1 ring-[var(--line)]">
        {items.slice(0, 6).map((item) => (
          <a
            key={item.link}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border-b border-[var(--line)] px-3.5 py-2.5 last:border-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold">{item.title}</span>
              <span className="text-[11px] text-[var(--text-faint)]">{when(item.published)}</span>
            </span>
            <ExternalLink size={13} className="shrink-0 text-[var(--text-faint)]" />
          </a>
        ))}
      </div>
    </section>
  );
}
