import Link from "next/link";
import { Dices } from "lucide-react";
import { Page } from "@/components/Shell";

/**
 * Games and virtuals.
 *
 * The platform is a sportsbook only; there is no casino or virtuals engine
 * behind this. The page says so rather than showing tiles that go nowhere.
 */
export default function GamesPage() {
  return (
    <Page>
      <div className="px-3 py-4 md:mx-auto md:max-w-2xl md:px-5">
        <h1 className="text-[20px] font-black text-[var(--text-bright)]">Games</h1>

        <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-6 text-center md:py-12">
          <Dices size={36} strokeWidth={1.5} className="mx-auto text-[var(--text-faint)]" />
          <h2 className="mt-2 text-[15px] font-black text-[var(--text-bright)]">Not open yet</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-[var(--text-muted)]">
            Virtuals and instant games are not part of this platform yet. Everything here settles off
            real fixtures.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded bg-[var(--accent)] px-5 py-2.5 text-[13px] font-black text-[var(--accent-ink)]"
          >
            Back to football
          </Link>
        </div>
      </div>
    </Page>
  );
}
