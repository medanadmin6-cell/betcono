"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { useSession } from "@/lib/store";
import { supportDigits, telHref, whatsappHref } from "@/lib/support-numbers";

interface Lines {
  phone: string | null;
  whatsapp: string | null;
}

/**
 * Call and WhatsApp buttons for the partner who referred this player.
 * A platform WhatsApp number is used only when the partner has not set one.
 */
export function PartnerSupport({
  fallbackWhatsapp,
  className = "",
}: {
  fallbackWhatsapp?: string | null;
  className?: string;
}) {
  const player = useSession((s) => s.player);
  const [lines, setLines] = useState<Lines | null>(null);

  useEffect(() => {
    if (!player) {
      setLines(null);
      return;
    }
    let alive = true;
    fetch(`/api/me?userId=${encodeURIComponent(player.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!alive) return;
        const phone = supportDigits(json?.support?.phone);
        const whatsapp = supportDigits(json?.support?.whatsapp);
        setLines({ phone, whatsapp });
      })
      .catch(() => {
        if (alive) setLines({ phone: null, whatsapp: null });
      });
    return () => {
      alive = false;
    };
  }, [player]);

  const phone = lines?.phone ?? null;
  const whatsapp = lines?.whatsapp ?? supportDigits(fallbackWhatsapp);
  if (!phone && !whatsapp) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {phone && (
        <a
          href={telHref(phone)}
          className="inline-flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-2 text-[12px] font-black text-[var(--accent-ink)]"
        >
          <Phone size={14} strokeWidth={2.2} />
          Call support
        </a>
      )}
      {whatsapp && (
        <a
          href={whatsappHref(whatsapp, player?.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded bg-[#128C7E] px-3 py-2 text-[12px] font-black text-white"
        >
          <MessageCircle size={14} strokeWidth={2.2} />
          WhatsApp support
        </a>
      )}
    </div>
  );
}
