"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, Sun, Moon, Tv, ReceiptText, User } from "lucide-react";
import { useSession, useSlip } from "@/lib/store";
import { BrandIcon } from "@/components/icons";
import { AccountDrawer } from "@/components/AccountDrawer";
import { formatMoney } from "@/lib/countries";

/**
 * The app shell.
 *
 * Header is 44px on the brand bar: mark on the left, then search and the two
 * account actions. Bottom navigation is five items with the home mark first,
 * and the bet slip rides above it as a floating counter that only appears once
 * there is something on the slip.
 *
 * Content runs edge to edge at every width — a desktop board fills the viewport
 * rather than sitting in a centred column. Only the padding grows with the
 * screen. Form panels (login, deposit) keep their own narrow measure.
 */

function HeaderActions({ onOpenAccount }: { onOpenAccount: () => void }) {
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const setBalance = useSession((s) => s.setBalance);

  // Keep the header balance honest without the player having to reload.
  useEffect(() => {
    if (!player) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/me?userId=${player.id}`);
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
  }, [player?.id, setBalance, player]);

  if (!hydrated) return <div className="h-7 w-32 rounded-lg bg-[var(--surface-2)]" />;

  if (!player) {
    return (
      <>
        <Link
          href="/login"
          className="rounded-xl border border-white/40 px-3.5 py-1.5 text-[12px] font-bold text-white"
        >
          Login
        </Link>
        <Link
          href="/register"
          className="rounded-xl bg-gradient-to-r from-[#f6cf4b] via-[#f3c838] to-[#e8b317] px-4 py-1.5 text-[12px] font-bold text-[#4b0f14] shadow-lg shadow-amber-500/20"
        >
          Register
        </Link>
      </>
    );
  }

  return (
    <>
      <button
        onClick={onOpenAccount}
        aria-label="Account and balance"
        className="rounded-full px-3 py-1 text-[13px] font-bold text-[#f4c430] ring-1 ring-[#f4c430]"
      >
        {formatMoney(Number(player.balance), player.currency)}
      </button>
      <Link
        href="/deposit"
        className="rounded-xl bg-gradient-to-r from-[#f6cf4b] via-[#f3c838] to-[#e8b317] px-4 py-1.5 text-[12px] font-bold text-[#4b0f14] shadow-lg shadow-amber-500/20"
      >
        Deposit
      </Link>
    </>
  );
}

/** Desktop-only primary navigation, mirroring the reference header. */
const HEADER_NAV = [
  { href: "/", label: "Home" },
  { href: "/?tab=live", label: "Live" },
  { href: "/az", label: "Sports" },
  { href: "/games", label: "⚡ Games" },
  { href: "/games", label: "Virtual" },
] as const;

/**
 * White by default; the sun/moon flips the page ground to the maroon dark
 * theme. The choice lives on <html data-theme> so the token layer swaps, and
 * in localStorage so the head script can re-apply it before the next paint.
 */
function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* private mode — the toggle still works for this page view */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to white background" : "Switch to dark background"}
      className="p-1 text-white"
    >
      {dark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
    </button>
  );
}

export function Header() {
  const [accountOpen, setAccountOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[var(--chrome)]/95 backdrop-blur-md">
      <div className="flex h-[52px] w-full items-center gap-2 px-2.5 md:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-1">
          <span className="text-[19px] font-black tracking-wider text-white">
            Bet<span className="text-[#f4c430]">Cono</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 border-l border-white/20 pl-4 lg:flex">
          {HEADER_NAV.map((item) => {
            const active = pathname === "/" && item.href === "/";
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`rounded-lg px-4 py-2 text-[13px] font-bold text-white transition-all ${
                  active ? "border border-white/40 bg-white/10" : "hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <ThemeToggle />
          <Link href="/search" aria-label="Search" className="p-1 text-white">
            <Search size={21} strokeWidth={2} />
          </Link>
          <HeaderActions onOpenAccount={() => setAccountOpen(true)} />
        </div>
      </div>

      <AccountDrawer open={accountOpen} onClose={() => setAccountOpen(false)} />
    </header>
  );
}

// ------------------------------------------------------------- bottom nav

const NAV_LEFT = [
  { href: "/", label: "BetCono", Icon: BrandIcon },
  { href: "/?tab=live", label: "Live Matches", Icon: Tv },
] as const;

const NAV_RIGHT = [
  { href: "/my-bets", label: "My Bets", Icon: ReceiptText },
  { href: "/account", label: "Me Profile", Icon: User },
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
      style={{ color: active ? "#f4c430" : "rgba(255,255,255,0.7)" }}
    >
      {active && (
        <span className="absolute top-0 h-1 w-8 rounded-full bg-[#f4c430] shadow-[0_0_8px_rgba(244,196,48,0.7)]" />
      )}
      <Icon size={20} strokeWidth={1.8} />
      <span className="text-[10px] font-bold">{label}</span>
    </Link>
  );
}

/** The raised gold betslip button that anchors the middle of the nav. */
function SlipCircle() {
  const legs = useSlip((s) => s.legs);
  const setOpen = useSlip((s) => s.setOpen);

  return (
    <div className="relative flex items-start justify-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Bet slip, ${legs.length} selection${legs.length === 1 ? "" : "s"}`}
        className="glow-gold relative -top-5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-[var(--accent)] text-[var(--accent-ink)] transition-transform hover:scale-105 active:scale-95"
      >
        <ReceiptText size={24} strokeWidth={2.2} />
        <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--lose)] text-[11px] font-black text-white shadow-md">
          {legs.length}
        </span>
      </button>
    </div>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/20 bg-[var(--chrome)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
      <div className="grid w-full grid-cols-5 md:mx-auto md:max-w-2xl">
        {NAV_LEFT.map((item) => (
          <NavItem key={item.label} {...item} active={pathname === item.href} />
        ))}
        <SlipCircle />
        {NAV_RIGHT.map((item) => (
          <NavItem key={item.label} {...item} active={pathname === item.href} />
        ))}
      </div>
    </nav>
  );
}

/** Desktop floating slip button, bottom-right like the reference. */
export function SlipButton() {
  const legs = useSlip((s) => s.legs);
  const setOpen = useSlip((s) => s.setOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Bet slip, ${legs.length} selection${legs.length === 1 ? "" : "s"}`}
      className="glow-gold fixed bottom-8 right-8 z-30 hidden h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-[var(--accent)] text-[var(--accent-ink)] transition-transform hover:scale-105 active:scale-95 lg:flex"
    >
      <ReceiptText size={24} strokeWidth={2.2} />
      <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[var(--lose)] text-[11px] font-black text-white shadow-md">
        {legs.length}
      </span>
    </button>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="min-h-[70vh] w-full pb-24">{children}</main>
      <SlipButton />
      <BottomNav />
    </>
  );
}
