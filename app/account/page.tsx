"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Settings,
  Eye,
  EyeOff,
  Wallet,
  Banknote,
  ReceiptText,
  CircleDollarSign,
  Trophy,
  ChevronRight,
  Info,
  Headphones,
  UserRound,
  Handshake,
  LogOut,
} from "lucide-react";
import { Page } from "@/components/Shell";
import { SupportChat } from "@/components/SupportChat";
import { useSession } from "@/lib/store";
import { formatMoney } from "@/lib/countries";
import { standing, maskPhone } from "@/lib/tiers";

interface MeResponse {
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    currency: string;
    balance: number;
    total_deposited: number;
    total_withdrawn: number;
    verification_step: number;
    qualifying_deposits: number;
    withdrawal_approved: boolean;
  };
  country: { name: string; currency: string; payoutRail: string };
  withdrawal: {
    unlocked: boolean;
    failed?: string;
    progress: { have: number; need: number; label: string };
  };
  partner: { id: string; referral_code: string; approved: boolean } | null;
  tierPoints: number;
}

function AccountView() {
  const router = useRouter();
  const player = useSession((s) => s.player);
  const hydrated = useSession((s) => s.hydrated);
  const signOut = useSession((s) => s.signOut);
  const setBalance = useSession((s) => s.setBalance);

  const [data, setData] = useState<MeResponse | null>(null);
  const [swept, setSwept] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (hydrated && !player) router.replace("/login");
  }, [hydrated, player, router]);

  useEffect(() => {
    if (!player) return;
    let alive = true;

    const run = async () => {
      // Sweep up anything that settled while the player was away — a closed tab
      // before the redirect fired is the one way hosted checkouts go wrong.
      // Credits are idempotent, so calling this on every load is safe.
      try {
        const res = await fetch("/api/deposits/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: player.id }),
        });
        const json = await res.json();
        if (alive && json.credited > 0) setSwept(json.credited);
      } catch {
        /* reconciliation is best-effort */
      }

      try {
        const res = await fetch(`/api/me?userId=${player.id}`);
        if (!res.ok) return;
        const json: MeResponse = await res.json();
        if (!alive) return;
        setData(json);
        setBalance(Number(json.user.balance));
      } catch {
        /* the page renders from the session until this lands */
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [player, setBalance]);

  if (!player) return null;

  const balance = Number(data?.user.balance ?? player.balance);
  const tier = standing(data?.tierPoints ?? 0);

  return (
    <Page>
      <div className="space-y-3 px-4 py-4 md:mx-auto md:max-w-2xl">
        {/* Identity, balance and tier standing, on the navy chrome in both themes. */}
        <header className="relative overflow-hidden rounded-md bg-[#071a33] p-4 text-white">
          <ChipWatermark />

          <div className="relative flex items-start gap-3">
            <Image
              src="/avatar.svg"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-full"
            />

            <div className="min-w-0 flex-1">
              <Link href="/profile" className="flex items-center gap-1">
                <span className="text-[16px] font-black tabular-nums text-white">
                  {maskPhone(player.phone)}
                </span>
                <ChevronRight size={16} strokeWidth={2.2} className="text-white/60" />
              </Link>

              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[13px] font-black tabular-nums text-white">
                  {tier.points.toLocaleString()}
                </span>
                <span className="text-[11px] tabular-nums text-white/60">
                  / {(tier.next?.at ?? tier.current.at).toLocaleString()} tier points
                </span>
                <Link href="/how-to-play" aria-label="About tier points">
                  <Info size={12} strokeWidth={2} className="text-white/60" />
                </Link>
              </div>
            </div>

            <Link href="/profile" aria-label="Settings" className="shrink-0 rounded p-1 text-white/80 hover:bg-white/10">
              <Settings size={19} strokeWidth={1.9} />
            </Link>
          </div>

          <div className="relative mt-3 h-1 bg-white/15">
            <div className="h-full bg-[#9ff611]" style={{ width: `${tier.progress * 100}%` }} />
          </div>
          <div className="relative mt-1.5 flex justify-between text-[11px] text-white/60">
            <span>{tier.current.name}</span>
            <span className="tabular-nums">
              {tier.next
                ? `${tier.toNext.toLocaleString()} points to ${tier.next.name}`
                : "Top tier reached"}
            </span>
          </div>

          <div className="relative mt-4 border-t border-white/10 pt-3">
            <p className="text-[11px] font-semibold text-white/60">Total balance</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-[28px] font-black leading-none tabular-nums text-[#9ff611]">
                {hidden ? "••••••" : formatMoney(balance, player.currency)}
              </p>
              <button
                onClick={() => setHidden((h) => !h)}
                aria-label={hidden ? "Show balance" : "Hide balance"}
                className="rounded p-1 text-white/60 hover:text-white"
              >
                {hidden ? <EyeOff size={17} strokeWidth={1.9} /> : <Eye size={17} strokeWidth={1.9} />}
              </button>
            </div>

            <div className="mt-3.5 grid grid-cols-2 gap-2">
              <Link
                href="/deposit"
                className="flex items-center justify-center gap-2 rounded-[5px] bg-[#9ff611] py-2.5 text-[14px] font-black text-[#071a33]"
              >
                <Wallet size={17} strokeWidth={2.2} />
                Deposit
              </Link>
              <Link
                href="/withdraw"
                className="flex items-center justify-center gap-2 rounded-[5px] py-2.5 text-[14px] font-black text-white ring-1 ring-white/35 hover:bg-white/10"
              >
                <Banknote size={17} strokeWidth={2.2} />
                Withdraw
              </Link>
            </div>
          </div>
        </header>

        {swept !== null && (
          <p className="rounded-md border border-[var(--win)] bg-[var(--bg-elevated)] px-3 py-2.5 text-[12px] font-semibold text-[var(--win-2)]">
            We found {swept} completed deposit{swept === 1 ? "" : "s"} and credited your wallet.
          </p>
        )}

        <Link
          href="/how-to-play#loyalty"
          className="flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3"
        >
          <span className="flex items-center gap-2.5">
            <Trophy size={18} strokeWidth={2} className="text-[var(--accent)]" />
            <span className="text-[14px] font-bold text-[var(--text-bright)]">Loyalty rewards</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-right">
              <span className="block text-[10px] text-[var(--text-muted)]">Potential reward</span>
              <span className="block text-[13px] font-black tabular-nums text-[var(--accent)]">
                {formatMoney(tier.potentialReward, player.currency)}
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2.2} className="text-[var(--text-faint)]" />
          </span>
        </Link>

        <div className="grid grid-cols-2 gap-2">
          <Tile href="/my-bets" icon={<ReceiptText size={20} strokeWidth={1.9} />} label="Bet history" />
          <Tile
            href="/transactions"
            icon={<CircleDollarSign size={20} strokeWidth={1.9} />}
            label="Transactions"
          />
        </div>

        <nav className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg-elevated)]">
          {data?.partner && (
            <Row
              href="/partner"
              icon={<Handshake size={18} strokeWidth={1.9} />}
              label="Partner dashboard"
              hint={`Code ${data.partner.referral_code}${data.partner.approved ? "" : " · awaiting approval"}`}
              accent
            />
          )}
          <Row href="/profile" icon={<UserRound size={18} strokeWidth={1.9} />} label="Personal details" />
          <Row href="/how-to-play" icon={<Info size={18} strokeWidth={1.9} />} label="How to play" />
          <Row
            href="/how-to-play#support"
            icon={<Headphones size={18} strokeWidth={1.9} />}
            label="Customer service"
            dot
          />
        </nav>

        <button
          onClick={() => {
            signOut();
            router.push("/");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[5px] border border-[var(--line)] py-2.5 text-[13px] font-bold text-[var(--lose)]"
        >
          <LogOut size={15} strokeWidth={2} />
          Log out
        </button>
      </div>

      <SupportChat />
    </Page>
  );
}

/** The chip motif behind the account header. */
function ChipWatermark() {
  return (
    <svg
      className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white opacity-[0.04]"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="14 9" />
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="3" />
      <text
        x="50"
        y="63"
        textAnchor="middle"
        fontSize="34"
        fontWeight="900"
        fill="currentColor"
        fontFamily="system-ui, sans-serif"
      >
        B
      </text>
    </svg>
  );
}

function Tile({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] py-3.5 text-[var(--text-bright)] hover:bg-[var(--surface-3)]"
    >
      <span className="text-[var(--accent)]">{icon}</span>
      <span className="text-[12px] font-bold">{label}</span>
    </Link>
  );
}

function Row({
  href,
  icon,
  label,
  hint,
  dot,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  dot?: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0 hover:bg-[var(--surface-3)]"
    >
      <span style={{ color: accent ? "var(--accent)" : "var(--text-muted)" }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-[var(--text)]">{label}</span>
        {hint && <span className="block text-[11px] text-[var(--text-muted)]">{hint}</span>}
      </span>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-[var(--win)]" />}
      <ChevronRight size={17} strokeWidth={2} className="text-[var(--text-faint)]" />
    </Link>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountView />
    </Suspense>
  );
}
