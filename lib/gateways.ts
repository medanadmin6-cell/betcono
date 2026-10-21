import type { Gateway } from "./countries";

/**
 * Payment gateway adapters.
 *
 * Each rail has its own start / status shape, but they all end at the same
 * place: a confirmed status hands the reference to applyDepositCredit, which is
 * the only function allowed to move money into a wallet.
 *
 * Every adapter degrades to a clear error rather than throwing, so a missing
 * key shows the player a message instead of a stack trace.
 */

export type ChargeStatus = "pending" | "confirmed" | "failed";

/**
 * What the rail says became of a charge.
 *
 * The settled amount matters as much as the status. A player can start a
 * GH₵500 deposit and approve GH₵5 on the handset, and the rail will call that
 * successful — it is, it just is not the deposit that was asked for. Every
 * adapter that can report what actually arrived does, and the credit path uses
 * that figure rather than the one the player typed in.
 */
export interface ChargeOutcome {
  status: ChargeStatus;
  /** What the rail says actually settled. Absent when the rail does not say. */
  paidAmount?: number;
  paidCurrency?: string;
}

export interface StartResult {
  ok: boolean;
  /** Anything the payment row should remember, such as the rail's charge id. */
  metadata?: Record<string, unknown>;
  /** Hosted checkout URL, when the rail redirects. */
  redirectUrl?: string;
  /** True when the player must approve a prompt on their handset. */
  awaitingPrompt?: boolean;
  /** True when the rail additionally wants an OTP typed in. */
  awaitingOtp?: boolean;
  error?: string;
}

export interface GatewayAdapter {
  id: Gateway;
  label: string;
  start(opts: StartOpts): Promise<StartResult>;
  /** `meta` is the payment row's metadata, which may carry the charge id. */
  status(reference: string, meta?: Record<string, unknown>): Promise<ChargeOutcome>;
}

export interface StartOpts {
  reference: string;
  amount: number;
  currency: string;
  phone: string;
  email: string;
  name: string;
  redirectUrl: string;
}

function env(name: string): string | null {
  return process.env[name] || null;
}

// ---------------------------------------------------------------- Korapay

const korapay: GatewayAdapter = {
  id: "korapay",
  label: "Korapay",
  async start({ reference, amount, currency, email, name, redirectUrl }) {
    const key = env("KORAPAY_SECRET_KEY");
    if (!key) return { ok: false, error: "Korapay is not available right now" };
    try {
      const res = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          amount,
          currency,
          redirect_url: redirectUrl,
          customer: { email: email || "player@betcono.com", name },
          notification_url: `${redirectUrl.split("/account")[0]}/api/deposits/korapay/webhook`,
        }),
      });
      const json = await res.json();
      if (!json?.status) return { ok: false, error: json?.message ?? "Could not start checkout" };
      return { ok: true, redirectUrl: json.data?.checkout_url };
    } catch (err) {
      console.error("[korapay] start", err);
      return { ok: false, error: "Could not start checkout" };
    }
  },
  async status(reference) {
    const key = env("KORAPAY_SECRET_KEY");
    if (!key) return { status: "pending" };
    try {
      const res = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const json = await res.json();
      const s = String(json?.data?.status ?? "").toLowerCase();
      const status: ChargeStatus =
        s === "success" ? "confirmed" : s === "failed" || s === "expired" ? "failed" : "pending";
      const paid = Number(json?.data?.amount);
      return {
        status,
        paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
        paidCurrency: json?.data?.currency,
      };
    } catch {
      return { status: "pending" };
    }
  },
};

// ----------------------------------------------------------------- Moolre

const moolre: GatewayAdapter = {
  id: "moolre",
  label: "Moolre",
  async start({ reference, amount, currency, phone }) {
    const key = env("MOOLRE_API_KEY");
    const user = env("MOOLRE_API_USER");
    const account = env("MOOLRE_ACCOUNT_NUMBER");
    if (!key || !user || !account) return { ok: false, error: "Moolre is not available right now" };
    try {
      const res = await fetch("https://api.moolre.com/open/transact/receive", {
        method: "POST",
        headers: { "X-API-USER": user, "X-API-PUBKEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: 1,
          channel: 13,
          currency,
          payer: phone,
          amount,
          accountnumber: account,
          reference,
          externalref: reference,
        }),
      });
      const json = await res.json();
      if (json?.status !== 1) return { ok: false, error: json?.message ?? "Could not start the charge" };
      return { ok: true, awaitingPrompt: true };
    } catch (err) {
      console.error("[moolre] start", err);
      return { ok: false, error: "Could not start the charge" };
    }
  },
  async status(reference) {
    const key = env("MOOLRE_API_KEY");
    const user = env("MOOLRE_API_USER");
    const account = env("MOOLRE_ACCOUNT_NUMBER");
    if (!key || !user || !account) return { status: "pending" };
    try {
      const res = await fetch("https://api.moolre.com/open/transact/status", {
        method: "POST",
        headers: { "X-API-USER": user, "X-API-PUBKEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ type: 1, accountnumber: account, externalref: reference }),
      });
      const json = await res.json();
      const code = Number(json?.data?.txstatus ?? json?.status);
      const status: ChargeStatus = code === 1 ? "confirmed" : code === 2 || code === 3 ? "failed" : "pending";
      const paid = Number(json?.data?.amount);
      return {
        status,
        paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
        paidCurrency: json?.data?.currency,
      };
    } catch {
      return { status: "pending" };
    }
  },
};

// ---------------------------------------------------------------- Paystack

const paystack: GatewayAdapter = {
  id: "paystack",
  label: "Paystack",
  async start({ reference, amount, currency, email, phone, redirectUrl }) {
    const key = env("PAYSTACK_SECRET_KEY");
    if (!key) return { ok: false, error: "Paystack is not available right now" };
    try {
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          // Paystack takes the minor unit.
          amount: Math.round(amount * 100),
          currency,
          email: email || `${phone}@betcono.com`,
          callback_url: redirectUrl,
        }),
      });
      const json = await res.json();
      if (!json?.status) return { ok: false, error: json?.message ?? "Could not start checkout" };
      return { ok: true, redirectUrl: json.data?.authorization_url };
    } catch (err) {
      console.error("[paystack] start", err);
      return { ok: false, error: "Could not start checkout" };
    }
  },
  async status(reference) {
    const key = env("PAYSTACK_SECRET_KEY");
    if (!key) return { status: "pending" };
    try {
      const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const json = await res.json();
      const s = String(json?.data?.status ?? "").toLowerCase();
      const status: ChargeStatus =
        s === "success" ? "confirmed" : s === "failed" || s === "abandoned" ? "failed" : "pending";
      // Paystack reports in the minor unit.
      const paid = Number(json?.data?.amount) / 100;
      return {
        status,
        paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
        paidCurrency: json?.data?.currency,
      };
    } catch {
      return { status: "pending" };
    }
  },
};

// ---------------------------------------------------------------- AlphaPay

/**
 * AlphaPay (api.edibytes.online): initialize creates the charge on their
 * side, and then OUR OWN /checkout page drives it — phone number, handset
 * prompt, and the OTP code — through that page's unauthenticated,
 * reference-keyed endpoints, proxied under /api/deposits/alphapay.
 *
 * Amounts are the MAJOR unit: a live initialize of amount 1 came back as
 * "1.00" GHS. ALPHAPAY_UNIT=minor remains as an escape hatch should that
 * ever change. The account must whitelist every domain it collects from,
 * under Domains in the AlphaPay dashboard — that is the `domain` sent here,
 * from ALPHAPAY_DOMAIN or the deposit page's own host.
 */
export const ALPHAPAY_BASE = "https://api.edibytes.online/api/payments";

function alphapayMinorUnits(): boolean {
  return (process.env.ALPHAPAY_UNIT || "major") === "minor";
}

const alphapay: GatewayAdapter = {
  id: "alphapay",
  label: "AlphaPay",
  async start({ reference, amount, currency, phone, redirectUrl }) {
    const key = env("ALPHAPAY_SECRET_KEY");
    if (!key) return { ok: false, error: "AlphaPay is not available right now" };

    let domain = env("ALPHAPAY_DOMAIN");
    if (!domain) {
      try {
        domain = new URL(redirectUrl).hostname;
      } catch {
        return { ok: false, error: "AlphaPay is not available right now" };
      }
    }

    try {
      const res = await fetch(`${ALPHAPAY_BASE}/initialize/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          amount: alphapayMinorUnits() ? Math.round(amount * 100) : amount,
          currency,
          domain,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) {
        const message = json?.error?.message ?? json?.message;
        console.error("[alphapay] start", res.status, message);
        return { ok: false, error: typeof message === "string" ? message : "Could not start checkout" };
      }
      // The player types the number on our page, but the one from the deposit
      // form makes a sensible prefill.
      return {
        ok: true,
        metadata: { alphapay_id: json?.id, phone },
        redirectUrl: `/checkout?reference=${encodeURIComponent(reference)}`,
      };
    } catch (err) {
      console.error("[alphapay] start", err);
      return { ok: false, error: "Could not start checkout" };
    }
  },
  async status(reference) {
    const key = env("ALPHAPAY_SECRET_KEY");
    if (!key) return { status: "pending" };
    try {
      const res = await fetch(`${ALPHAPAY_BASE}/verify/${encodeURIComponent(reference)}/`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const json = await res.json().catch(() => null);
      const row = (json?.data ?? json) as Record<string, unknown> | null;
      const s = String(row?.status ?? "").toLowerCase();
      const status: ChargeStatus = ["success", "successful", "paid", "completed", "confirmed"].includes(s)
        ? "confirmed"
        : ["failed", "cancelled", "canceled", "declined", "expired", "voided"].includes(s)
          ? "failed"
          : "pending";
      const raw = Number(row?.amount);
      const paid = alphapayMinorUnits() ? raw / 100 : raw;
      return {
        status,
        paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
        paidCurrency: typeof row?.currency === "string" ? row.currency : undefined,
      };
    } catch {
      return { status: "pending" };
    }
  },
};

/**
 * The manual rail: the player sends money to the displayed agent number and
 * uploads a screenshot. Nothing is automatic, so the status stays pending until
 * the operator confirms it in the console.
 */
const manual: GatewayAdapter = {
  id: "manual",
  label: "Mobile money transfer",
  async start() {
    return { ok: true };
  },
  async status(): Promise<ChargeOutcome> {
    return { status: "pending" };
  },
};

const ADAPTERS: Record<Gateway, GatewayAdapter> = {
  korapay,
  moolre,
  paystack,
  alphapay,
  manual,
};

/**
 * What a confirmed charge is actually worth.
 *
 * The rail's own figure wins whenever it gives one in the currency the deposit
 * was opened in. Everything else — a rail that reports nothing, a figure that
 * arrives in another currency — falls back to what the player asked for, which
 * is the best guess available and the behaviour that stood before.
 */
export function settledAmount(outcome: ChargeOutcome, requested: number, currency: string): number {
  const paid = outcome.paidAmount;
  if (!paid || !Number.isFinite(paid) || paid <= 0) return requested;
  if (outcome.paidCurrency && outcome.paidCurrency.toUpperCase() !== String(currency).toUpperCase()) {
    return requested;
  }
  return paid;
}

export function adapterFor(gateway: Gateway): GatewayAdapter {
  return ADAPTERS[gateway] ?? manual;
}

export function allAdapters(): GatewayAdapter[] {
  return Object.values(ADAPTERS);
}
