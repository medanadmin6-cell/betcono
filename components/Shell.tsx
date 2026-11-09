"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Search,
  Sun,
  Moon,
  Tv,
  ReceiptText,
  User,
  Home,
  CalendarDays,
  CalendarClock,
  Zap,
  Gamepad2,
  Ticket,
  ShieldCheck,
  CircleHelp,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { useSession, useSlip } from "@/lib/store";
import { useFeed } from "@/lib/feed";
import { SlipDockContext, useSlipDocked } from "@/lib/wide";
import { BrandIcon } from "@/components/icons";
import { AccountDrawer } from "@/components/AccountDrawer";
import { BetSlip, BetSlipPanel } from "@/components/BetSlip";
import { formatMoney } from "@/lib/countries";

/**
 * The app shell.
 *
 * Two layouts share it. A plain page (account, deposit, history) gets the
 * header, footer and bottom nav around a single column. A sportsbook page
 * (`rails`) gets the full board layout:
 *
 *   phone    header, sticky section tabs, content, bottom nav with the slip
 *   lg       left sidebar (sections + competitions) beside the content
 *   xl       plus the bet slip docked open in a right rail
 *
 * A rails page mounts the bet slip itself, as a sheet below xl and docked at
 * xl, so pages using it do not render their own <BetSlip />.
 */

/** The board's sections, used by the header, the mobile tabs and the sidebar. */
const SECTIONS: { key: string; label: string; href: string; Icon: LucideIcon }[] = [
  { key: "home", label: "Home", href: "/", Icon: Home },
  { key: "live", label: "Live", href: "/?tab=live", Icon: Tv },
  { key: "today", label: "Today", href: "/?tab=today", Icon: CalendarDays },
  { key: "tomorrow", label: "Tomorrow", href: "/?tab=tomorrow", Icon: CalendarClock },
  { key: "boosted", label: "Boosted", href: "/?tab=boosted", Icon: Zap },
  { key: "games", label: "Games", href: "/games", Icon: Gamepad2 },
];

const TOOLS: { label: string; href: string; Icon: LucideIcon }[] = [
  { label: "Load a code", href: "/load-code", Icon: Ticket },
  { label: "Check a bet", href: "/my-bets", Icon: ShieldCheck },
  { label: "All competitions", href: "/az", Icon: LayoutGrid },
  { label: "How to play", href: "/how-to-play", Icon: CircleHelp },
];

/** Which section the current URL is on. */
function useSection(): string {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  if (pathname === "/games") return "games";
  if (pathname !== "/") return "";
  return tab && SECTIONS.some((s) => s.key === tab) ? tab : "home";
}

// ----------------------------------------------------------------- header

function HeaderActions({ onOpenAccount }: { onOpenAccount: () => void }) {
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);
  const signOut = useSession((s) => s.signOut);
  const router = useRouter();

  // Keep the header balance honest without the player having to reload.
  // This also ends the session of a player the operator has frozen.
  useEffect(() => {
    if (!player) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/me?userId=${player.id}`);
        if (res.status === 403) {
          const json = await res.json().catch(() => null);
          if (alive && json?.frozen) {
            signOut();
            router.replace("/login?frozen=1");
          }
          return;
        }
        if (!res.ok) return;
        const json = await res.json();
        if (alive && json.user) setBalance(Number(json.user.balance));
      } catch {
        /* the header balance is not worth an error state */
      }
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [player?.id, setBalance, signOut, router, player]);

  if (!hydrated) return <div className="h-8 w-36 rounded bg-white/10" />;

  if (!player) {
    return (
      <>
        <Link
          href="/login"
          className="rounded-[5px] px-3 py-1.5 text-[13px] font-bold text-white ring-1 ring-white/35 hover:bg-white/10"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="rounded-[5px] bg-[#9ff611] px-3.5 py-1.5 text-[13px] font-black text-[#071a33] hover:bg-[#b4ff3a]"
        >
          Join
        </Link>
      </>
    );
  }

  return (
    <>
      <button
        onClick={onOpenAccount}
        aria-label="Account and balance"
        className="flex items-center gap-2 rounded-[5px] px-2 py-1 text-left hover:bg-white/10"
      >
        <span className="hidden text-[10px] font-semibold leading-tight text-white/60 sm:block">
          Balance
          <span className="block text-[13px] font-black tabular-nums text-[#9ff611]">
            {formatMoney(Number(player.balance), player.currency)}
          </span>
        </span>
        <span className="text-[13px] font-black tabular-nums text-[#9ff611] sm:hidden">
          {formatMoney(Number(player.balance), player.currency)}
        </span>
        <User size={18} strokeWidth={2} className="hidden text-white sm:block" />
      </button>
      <Link
        href="/deposit"
        className="rounded-[5px] bg-[#9ff611] px-3.5 py-1.5 text-[13px] font-black text-[#071a33] hover:bg-[#b4ff3a]"
      >
        Deposit
      </Link>
    </>
  );
}

/**
 * White by default; the sun/moon flips the page ground to the navy dark
 * theme. The choice lives on <html data-theme> so the token layer swaps, and
 * in localStorage so the head script can re-apply it before the next paint.
 */
function ThemeToggle() {
  const dark = useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      return () => observer.disconnect();
    },
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );

  const toggle = () => {
    const next = !dark;
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* private mode: the toggle still works for this page view */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
    >
      {dark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
    </button>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
      }}
      className="relative hidden w-full max-w-[280px] md:block"
      role="search"
    >
      <Search
        size={15}
        strokeWidth={2.2}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/50"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search teams or competitions"
        aria-label="Search teams or competitions"
        className="w-full rounded-[5px] bg-white/10 py-1.5 pl-8 pr-3 text-[12px] font-medium text-white outline-none placeholder:text-white/45 focus:bg-white/15 focus:ring-1 focus:ring-[#9ff611]"
      />
    </form>
  );
}

function DesktopNav() {
  const section = useSection();
  return (
    <nav className="hidden items-stretch self-stretch lg:flex" aria-label="Sections">
      {SECTIONS.filter((s) => s.key !== "home").map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className={`flex items-center border-b-2 px-3 text-[13px] font-bold transition-colors ${
            section === s.key
              ? "border-[#9ff611] text-white"
              : "border-transparent text-white/70 hover:text-white"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

/** The phone and tablet section strip under the header on board pages. */
function SectionTabs() {
  const section = useSection();
  const { matches } = useFeed();
  const live = matches?.filter((m) => m.isLive).length ?? 0;

  return (
    <nav
      className="scroll-x flex border-t border-white/10 px-1 lg:hidden"
      aria-label="Sections"
    >
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-bold ${
            section === s.key ? "border-[#9ff611] text-white" : "border-transparent text-white/65"
          }`}
        >
          {s.label}
          {s.key === "live" && live > 0 && (
            <span className="rounded-sm bg-[#d42b23] px-1 text-[10px] font-black leading-[15px] text-white">
              {live}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/**
 * One tap goes home. Two taps, for a signed-in operator or sub-admin, open
 * their dashboard. The second tap has to land before the home navigation.
 */
function BrandHome() {
  const router = useRouter();
  const wait = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (wait.current) window.clearTimeout(wait.current);
    };
  }, []);

  const openDashboard = async () => {
    try {
      const res = await fetch("/api/admin/me");
      const json = res.ok ? await res.json() : null;
      if (json?.role === "admin") {
        router.push("/admin");
        return;
      }
      if (json?.role === "sub") {
        router.push("/admin");
        return;
      }
      // A partner who is signed in but not yet approved still has a dashboard.
      const partner = await fetch("/api/partner/dashboard");
      if (partner.ok) {
        router.push("/partner");
        return;
      }
    } catch {
      /* no console session — fall through to home */
    }
    router.push("/");
  };

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (wait.current) {
      window.clearTimeout(wait.current);
      wait.current = null;
      void openDashboard();
      return;
    }
    wait.current = window.setTimeout(() => {
      wait.current = null;
      router.push("/");
    }, 350);
  };

  return (
    <Link href="/" onClick={onClick} className="flex shrink-0 items-center gap-2" aria-label="Pep Stake home">
      <BrandIcon size={26} className="text-[#9ff611]" />
      <span className="text-[18px] font-black tracking-tight text-white">
        Pep <span className="text-[#9ff611]">Stake</span>
      </span>
    </Link>
  );
}

export function Header({ sections = false }: { sections?: boolean }) {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[var(--chrome)]">
      <div className="flex h-14 w-full items-center gap-3 px-3 md:px-5">
        <BrandHome />

        <Suspense fallback={null}>
          <DesktopNav />
        </Suspense>

        <div className="flex flex-1 items-center justify-end gap-1.5 md:gap-2">
          <HeaderSearch />
          <Link
            href="/search"
            aria-label="Search"
            className="rounded p-1.5 text-white/80 hover:text-white md:hidden"
          >
            <Search size={19} strokeWidth={2} />
          </Link>
          <ThemeToggle />
          <HeaderActions onOpenAccount={() => setAccountOpen(true)} />
        </div>
      </div>

      {sections && (
        <Suspense fallback={null}>
          <SectionTabs />
        </Suspense>
      )}

      <AccountDrawer open={accountOpen} onClose={() => setAccountOpen(false)} />
    </header>
  );
}

// ---------------------------------------------------------------- sidebar

function SidebarLink({
  href,
  label,
  Icon,
  active,
  count,
  live,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active?: boolean;
  count?: number;
  live?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded px-2.5 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
          : "text-[var(--text)] hover:bg-[var(--surface)]"
      }`}
    >
      <Icon size={16} strokeWidth={2} className={active ? "" : "text-[var(--text-muted)]"} />
      <span className="flex-1 truncate">{label}</span>
      {count != null && count > 0 && (
        <span
          className={`text-[11px] font-bold tabular-nums ${
            active ? "" : live ? "text-[var(--live)]" : "text-[var(--text-faint)]"
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

function SidebarSections() {
  const section = useSection();
  const { matches } = useFeed();
  const live = matches?.filter((m) => m.isLive).length;
  const boosted = matches?.filter((m) => m.bestOdds).length;

  return (
    <div className="space-y-0.5">
      {SECTIONS.map((s) => (
        <SidebarLink
          key={s.key}
          href={s.href}
          label={s.label}
          Icon={s.Icon}
          active={section === s.key}
          count={s.key === "live" ? live : s.key === "boosted" ? boosted : undefined}
          live={s.key === "live"}
        />
      ))}
    </div>
  );
}

/** Competitions on the board right now, busiest first. */
function SidebarCompetitions() {
  const { matches } = useFeed();

  const leagues = useMemo(() => {
    const map = new Map<string, { country: string; count: number }>();
    for (const m of matches ?? []) {
      const entry = map.get(m.league) ?? { country: m.country, count: 0 };
      entry.count += 1;
      map.set(m.league, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 14);
  }, [matches]);

  return (
    <div>
      <h3 className="px-2.5 pb-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--text-faint)]">
        Competitions
      </h3>
      {matches === null ? (
        <div className="space-y-1.5 px-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-5 rounded bg-[var(--surface)]" />
          ))}
        </div>
      ) : (
        <ul>
          {leagues.map(([league, { country, count }]) => (
            <li key={league}>
              <Link
                href={`/search?q=${encodeURIComponent(league)}`}
                className="flex items-center gap-2 rounded px-2.5 py-1.5 text-[12px] hover:bg-[var(--surface)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[var(--text)]">{league}</span>
                  {country && (
                    <span className="block truncate text-[10px] text-[var(--text-faint)]">{country}</span>
                  )}
                </span>
                <span className="text-[11px] font-bold tabular-nums text-[var(--text-faint)]">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[232px] shrink-0 overflow-y-auto border-r border-[var(--line)] px-2 py-3 lg:block">
      <Suspense fallback={null}>
        <SidebarSections />
      </Suspense>

      <div className="my-3 h-px bg-[var(--line)]" />
      <SidebarCompetitions />

      <div className="my-3 h-px bg-[var(--line)]" />
      <div className="space-y-0.5">
        {TOOLS.map((t) => (
          <SidebarLink key={t.href} {...t} />
        ))}
      </div>
    </aside>
  );
}

/** The right rail: the bet slip, docked open on wide screens. */
function SlipRail() {
  const docked = useSlipDocked();
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[340px] shrink-0 flex-col py-3 pr-4 xl:flex">
      {docked && <BetSlipPanel />}
    </aside>
  );
}

// ----------------------------------------------------------------- footer

function Footer() {
  return (
    <footer className="mt-8 border-t border-[var(--line)] bg-[var(--bg-elevated)] px-4 pb-28 pt-6 md:px-6 lg:pb-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <span className="text-[16px] font-black tracking-tight text-[var(--text-bright)]">
            Pep <span className="text-[var(--accent)]">Stake</span>
          </span>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-muted)]">
            Betting is for adults aged 18 and over. Set a budget before you play and never stake
            money you need for other things.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-[12px] font-semibold sm:grid-cols-3" aria-label="Footer">
          <Link href="/how-to-play" className="text-[var(--text-muted)] hover:text-[var(--text)]">How to play</Link>
          <Link href="/load-code" className="text-[var(--text-muted)] hover:text-[var(--text)]">Load a code</Link>
          <Link href="/my-bets" className="text-[var(--text-muted)] hover:text-[var(--text)]">My bets</Link>
          <Link href="/deposit" className="text-[var(--text-muted)] hover:text-[var(--text)]">Deposit</Link>
          <Link href="/terms" className="text-[var(--text-muted)] hover:text-[var(--text)]">Terms</Link>
          <Link href="/privacy" className="text-[var(--text-muted)] hover:text-[var(--text)]">Privacy</Link>
        </nav>
      </div>
      <p className="mt-6 border-t border-[var(--line)] pt-4 text-[11px] text-[var(--text-faint)]">
        <span className="mr-2 inline-flex h-5 w-7 items-center justify-center rounded-sm border border-[var(--text-faint)] text-[10px] font-black">
          18+
        </span>
        © {new Date().getFullYear()} Pep Stake. Play responsibly.
      </p>
    </footer>
  );
}

// ------------------------------------------------------------- bottom nav

const NAV_LEFT = [
  { href: "/", label: "Home", Icon: BrandIcon },
  { href: "/?tab=live", label: "Live", Icon: Tv },
] as const;

const NAV_RIGHT = [
  { href: "/my-bets", label: "My Bets", Icon: ReceiptText },
  { href: "/account", label: "Account", Icon: User },
] as const;

function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: (typeof NAV_LEFT)[number]["Icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center justify-center gap-1 pb-2 pt-2.5"
      style={{ color: active ? "#9ff611" : "rgba(255,255,255,0.65)" }}
    >
      {active && <span className="absolute top-0 h-0.5 w-8 bg-[#9ff611]" />}
      <Icon size={20} strokeWidth={1.8} />
      <span className="text-[10px] font-bold">{label}</span>
    </Link>
  );
}

/** The slip button that anchors the middle of the nav. */
function SlipTab() {
  const legs = useSlip((s) => s.legs);
  const setOpen = useSlip((s) => s.setOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Bet slip, ${legs.length} selection${legs.length === 1 ? "" : "s"}`}
      className="flex flex-col items-center justify-center gap-1 pb-2 pt-2"
    >
      <span className="relative flex h-8 w-11 items-center justify-center rounded-[6px] bg-[#9ff611] text-[#071a33]">
        <ReceiptText size={18} strokeWidth={2.2} />
        {legs.length > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#d42b23] px-1 text-[10px] font-black text-white ring-2 ring-[var(--chrome)]">
            {legs.length}
          </span>
        )}
      </span>
      <span className="text-[10px] font-bold text-white/65">Slip</span>
    </button>
  );
}

function BottomNavItems() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const current = tab ? `${pathname}?tab=${tab}` : pathname;

  return (
    <div className="grid w-full grid-cols-5 md:mx-auto md:max-w-2xl">
      {NAV_LEFT.map((item) => (
        <NavItem key={item.label} {...item} active={current === item.href} />
      ))}
      <SlipTab />
      {NAV_RIGHT.map((item) => (
        <NavItem key={item.label} {...item} active={pathname === item.href} />
      ))}
    </div>
  );
}

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[var(--chrome)] pb-[env(safe-area-inset-bottom)] lg:hidden">
      <Suspense fallback={null}>
        <BottomNavItems />
      </Suspense>
    </nav>
  );
}

/** Desktop slip button, for widths where the slip is not docked. */
export function SlipButton() {
  const legs = useSlip((s) => s.legs);
  const setOpen = useSlip((s) => s.setOpen);
  const docked = useSlipDocked();

  if (docked) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Bet slip, ${legs.length} selection${legs.length === 1 ? "" : "s"}`}
      className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-md bg-[var(--chrome)] py-2.5 pl-3.5 pr-3 text-white shadow-lg ring-1 ring-white/15 hover:ring-[#9ff611] lg:flex"
    >
      <ReceiptText size={18} strokeWidth={2} className="text-[#9ff611]" />
      <span className="text-[13px] font-bold">Bet slip</span>
      <span className="flex h-5 min-w-5 items-center justify-center rounded bg-[#9ff611] px-1 text-[11px] font-black text-[#071a33]">
        {legs.length}
      </span>
    </button>
  );
}

export function Page({
  children,
  rails = false,
}: {
  children: React.ReactNode;
  /** The sportsbook layout: sidebar, section tabs and the docked slip. */
  rails?: boolean;
}) {
  if (!rails) {
    return (
      <>
        <Header />
        <main className="min-h-[70vh] w-full pb-6">{children}</main>
        <Footer />
        <SlipButton />
        <BottomNav />
      </>
    );
  }

  return (
    <SlipDockContext.Provider value>
      <Header sections />
      <div className="flex w-full">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <main className="min-h-[70vh] w-full px-2.5 pt-3 md:px-4 lg:px-5">{children}</main>
          <Footer />
        </div>
        <SlipRail />
      </div>
      <SlipButton />
      <BottomNav />
      <BetSlip />
    </SlipDockContext.Provider>
  );
}
