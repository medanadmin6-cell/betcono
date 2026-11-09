"use client";

import { useAdminData } from "@/components/admin/ui";
import { OverviewCards } from "@/components/OverviewCards";
import type { OverviewStats } from "@/lib/overview";

export default function OverviewPage() {
  const { data, error, busy } = useAdminData<OverviewStats & { scope?: "book" | "referral" }>(
    "/api/admin/overview",
  );

  if (error) return <p className="text-[13px] text-[var(--lose)]">{error}</p>;
  if (busy && !data) return <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>;
  if (!data) return null;

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100vh-7.5rem)] bg-[#07111f] px-4 py-5 text-white">
      <div className="mx-auto max-w-lg space-y-3">
        <div>
          <h1 className="text-[22px] font-black">Overview</h1>
          <p className="mt-1 text-[13px] text-white/60">
            {data.scope === "referral"
              ? "Live totals for players who used your referral code."
              : "Live totals for the whole book."}
          </p>
        </div>
        <OverviewCards stats={data} />
      </div>
    </div>
  );
}
