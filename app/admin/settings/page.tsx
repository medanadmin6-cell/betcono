"use client";

import { Panel } from "@/components/admin/ui";

export default function SettingsPage() {
  return (
    <div className="max-w-lg space-y-3">
      <Panel title="Platform configuration">
        <div className="space-y-2 p-4 text-[11px] text-[var(--text-muted)]">
          <p>
            Platform settings are configured through environment variables, so they can differ per
            deployment without a database write. The ones that change behaviour most:
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <code className="text-[var(--accent)]">FIRST_DEPOSIT_BONUS</code> — one-time welcome
              bonus, default 100
            </li>
            <li>
              <code className="text-[var(--accent)]">WITHDRAW_QUALIFY_COUNT_GH</code> — qualifying
              deposits needed; 0 reverts that market to the cumulative-total rule
            </li>
            <li>
              <code className="text-[var(--accent)]">WITHDRAW_QUALIFY_AMOUNT_GH</code> — how big each
              qualifying deposit must be
            </li>
            <li>
              <code className="text-[var(--accent)]">VERIFICATION_AMOUNT_GH</code>,{" "}
              <code className="text-[var(--accent)]">MIN_FIRST_DEPOSIT_GH</code>
            </li>
          </ul>
        </div>
      </Panel>
    </div>
  );
}
