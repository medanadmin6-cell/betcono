"use client";

import { useState } from "react";
import { Copy, Check, Link2, Download, Share2, Ticket, X } from "lucide-react";
import { useSession, type SlipLeg } from "@/lib/store";
import { copyText } from "@/lib/clipboard";

/**
 * The booking receipt: a maroon masthead the colour of the app's chrome, the
 * code writ large with copy and download beside it, the total odds, a worked
 * example bet, then every selection. The ticket keeps its own literal colours
 * in both themes — BetCono maroon and cream with a golden-yellow accent, a
 * branded artifact, not chrome.
 */
export function BookedCode({
  code,
  expiresAt,
  legs,
  onDone,
}: {
  code: string;
  expiresAt?: string | null;
  legs: SlipLeg[];
  onDone: () => void;
}) {
  const player = useSession((s) => s.player);

  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [shared, setShared] = useState(true);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/load-code?code=${code}`;
  const imageUrl = `/api/bookings/${code}/image`;
  const message = `Load my BetCono code ${code} — ${link}`;

  const totalOdds = legs.reduce((acc, l) => acc * l.odds, 1);
  const exampleStake = 10;
  const examplePayout = exampleStake * totalOdds;

  const money = (n: number) =>
    n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const copy = async (value: string, which: "code" | "link") => {
    const ok = await copyText(value);
    setCopied(ok ? which : null);
    if (ok) setTimeout(() => setCopied(null), 1600);
  };

  const toggleShare = async (next: boolean) => {
    setShared(next);
    if (!player) return;
    try {
      await fetch(`/api/bookings/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: player.id, shared: next }),
      });
    } catch {
      // The toggle is a listing preference; a failure is not worth an error state.
    }
  };

  const shareInApp = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `BetCono code ${code}`, text: message, url: link });
        return;
      } catch {
        /* dismissed */
      }
    }
    copy(link, "link");
  };

  return (
    <div className="border-t border-[var(--line)]">
      {/* Yellow masthead */}
      <div className="flex items-center justify-between bg-[#4b0f14] px-4 py-2.5 text-[#f7eedd]">
        <span className="flex items-center gap-2">
          <Ticket size={22} strokeWidth={2.4} />
          <span className="text-[16px] font-black tracking-wide">BETCONO</span>
          <span className="text-[13px] font-bold">🇬🇭 Ghana</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-right">
            <span className="block text-[15px] font-black leading-tight">Betslip</span>
            <span className="block text-[11px] font-semibold">
              {new Date().toLocaleString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
          <button
            onClick={onDone}
            aria-label="Back to slip"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </span>
      </div>

      {/* Ticket body — literal dark, in both themes */}
      <div className="bg-[#35090d] px-4 pb-4 pt-4">
        <h2 className="text-center text-[15px] font-bold text-[#f7eedd]">Booking Code</h2>

        <div className="mt-1 flex items-center justify-center gap-3">
          <span className="text-[32px] font-black leading-none tracking-[0.06em] text-[#f4c430]">
            {code}
          </span>
          <button
            onClick={() => copy(code, "code")}
            aria-label="Copy booking code"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5e141b] text-[#f7eedd]"
          >
            {copied === "code" ? (
              <Check size={19} strokeWidth={2.6} className="text-[#f4c430]" />
            ) : (
              <Copy size={19} strokeWidth={2} />
            )}
          </button>
          <a
            href={imageUrl}
            download={`betcono-${code}.png`}
            aria-label="Download ticket"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5e141b] text-[#f7eedd]"
          >
            <Download size={19} strokeWidth={2} />
          </a>
        </div>

        <p className="mt-1.5 text-center text-[12px] text-[#d8bdb4]">
          {expiresAt
            ? `Valid till ${new Date(expiresAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "No expiry"}
        </p>

        {/* Total odds */}
        <div className="mt-3 rounded-lg border-b-4 border-[#f4c430] bg-[#5e141b] px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[16px] font-semibold text-[#f7eedd]">Odds</span>
            <span className="text-[24px] font-black leading-none text-white">
              {money(totalOdds)}
            </span>
          </div>
        </div>

        {/* Example bet */}
        <div className="mt-3 overflow-hidden rounded-lg">
          <div className="bg-[#f7eedd] px-4 py-2">
            <span className="text-[15px] font-black text-[#7a1b22]">Example Bet</span>
          </div>
          <div className="space-y-2 bg-white px-4 py-3">
            <div className="flex items-center justify-between text-[15px] text-[#4b0f14]">
              <span>Stake</span>
              <span className="font-semibold">{money(exampleStake)}</span>
            </div>
            <div className="flex items-center justify-between text-[15px] text-[#4b0f14]">
              <span>Payout</span>
              <span className="font-semibold">{money(examplePayout)}</span>
            </div>
          </div>
        </div>

        {/* Selections */}
        <div className="mt-3 overflow-hidden rounded-lg">
          <div className="bg-[#f7eedd] px-4 py-2">
            <span className="text-[15px] font-black text-[#7a1b22]">Selections</span>
          </div>
          <ul className="divide-y divide-[#eef2f7] bg-white">
            {legs.map((l) => (
              <li key={`${l.matchId}-${l.market}-${l.outcome}`} className="px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#7a1b22]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#7a1b22]" />
                    </span>
                    <span className="text-[16px] font-black text-[#4b0f14]">{l.outcomeLabel}</span>
                  </span>
                  <span className="text-[16px] font-black text-[#4b0f14]">{money(l.odds)}</span>
                </div>
                <p className="mt-1 pl-6 text-[14px] text-[#8a5a52]">
                  {l.homeTeam} vs {l.awayTeam}
                </p>
                <p className="pl-6 text-[13px] text-[#b08d84]">{l.marketLabel}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Sharing, on the sheet's own tokens */}
      <div className="px-5 pb-5 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-[var(--text-bright)]">Share Code on Personal Page</span>
          <button
            role="switch"
            aria-checked={shared}
            onClick={() => toggleShare(!shared)}
            className="relative h-6 w-11 rounded-full transition-colors"
            style={{ background: shared ? "var(--accent)" : "var(--surface-2)" }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
              style={{ left: shared ? "calc(100% - 22px)" : "2px" }}
            />
          </button>
        </div>

        <hr className="mt-4 border-[var(--line)]" />

        <div className="mt-4 grid grid-cols-5 gap-1">
          <ShareAction
            label="X / Twitter"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`}
            icon={<XLogo />}
          />
          <ShareAction
            label="Whatsapp"
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            icon={<WhatsAppLogo />}
          />
          <ShareAction label="Share In App" onClick={shareInApp} icon={<Share2 size={19} strokeWidth={2} />} />
          <ShareAction
            label={copied === "link" ? "Copied" : "Copy Link"}
            onClick={() => copy(link, "link")}
            icon={copied === "link" ? <Check size={19} strokeWidth={2.4} /> : <Link2 size={19} strokeWidth={2} />}
          />
          <ShareAction
            label="Save"
            href={imageUrl}
            download={`betcono-${code}.png`}
            icon={<Download size={19} strokeWidth={2} />}
          />
        </div>

        <button
          onClick={onDone}
          className="mt-4 w-full py-2 text-[13px] font-semibold text-[var(--text-muted)]"
        >
          Back to slip
        </button>
      </div>
    </div>
  );
}

function ShareAction({
  label,
  icon,
  href,
  onClick,
  download,
}: {
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  download?: string;
}) {
  const body = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#4b0f14]">
        {icon}
      </span>
      <span className="text-center text-[11px] leading-tight text-[var(--text)]">{label}</span>
    </>
  );

  const shell = "flex flex-col items-center gap-1.5";

  if (href) {
    return (
      <a
        href={href}
        download={download}
        target={download ? undefined : "_blank"}
        rel="noopener noreferrer"
        className={shell}
      >
        {body}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={shell}>
      {body}
    </button>
  );
}

function XLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.6-8.7L1.6 2h6.8l4.7 6.2zm-1.1 18h1.7L7.3 3.7H5.4z" />
    </svg>
  );
}

function WhatsAppLogo() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a9.9 9.9 0 00-8.5 15L2 22l5.2-1.4A9.9 9.9 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8 8 0 1112 20zm4.5-5.9c-.2-.1-1.4-.7-1.7-.8s-.4-.1-.5.1-.6.8-.7.9-.3.2-.5.1a6.5 6.5 0 01-1.9-1.2 7.3 7.3 0 01-1.4-1.7c-.1-.3 0-.4.1-.5l.4-.5.2-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 00-.7.3 2.8 2.8 0 00-.9 2.1 4.9 4.9 0 001 2.6 11 11 0 004.2 3.7 8.6 8.6 0 001.4.5 3.4 3.4 0 001.6.1 2.6 2.6 0 001.7-1.2 2.1 2.1 0 00.1-1.2z" />
    </svg>
  );
}
