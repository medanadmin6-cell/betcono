"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * Deactivation and reactivation. Both are operator actions — nothing here
 * changes an account on its own.
 */
export default function AccountStatusPage() {
  const router = useRouter();
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-[455px] px-4 pb-16 pt-5">
        <div className="flex items-center justify-between py-1">
          <h1 className="text-[18px] font-black text-[var(--text-bright)]">Account status</h1>
          <button
            onClick={() => router.push("/login")}
            aria-label="Close"
            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="mt-5 space-y-2">
          <section className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
            <h2 className="text-[15px] font-black text-[var(--text-bright)]">Deactivate</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
              Closes your account and stops all activity. Any balance is paid out first, so withdraw
              before you ask us to close it.
            </p>
          </section>

          <section className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
            <h2 className="text-[15px] font-black text-[var(--text-bright)]">Reactivate</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
              We can reopen a closed account on the same phone number. Your bet history comes back
              with it.
            </p>
          </section>

          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-[5px] bg-[var(--accent)] py-3 text-center text-[14px] font-black text-[var(--accent-ink)]"
            >
              Contact support
            </a>
          ) : (
            <p className="rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3 text-center text-[13px] text-[var(--text-muted)]">
              Support contact is not configured on this deployment.
            </p>
          )}

          <Link href="/login" className="block py-2 text-center text-[14px] font-bold text-[var(--accent)]">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
