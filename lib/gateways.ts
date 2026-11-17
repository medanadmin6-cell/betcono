import { createDecipheriv } from "node:crypto";
import type { Gateway } from "./countries";

/**
 * The payment gateway adapter.
 *
 * AlphaPay is the only rail. A confirmed status hands the reference to
 * applyDepositCredit, which is the only function allowed to move money into a
 * wallet.
 *
 * The adapter degrades to a clear error rather than throwing, so a missing
 * key shows the player a message instead of a stack trace.
 */

export type ChargeStatus = "pending" | "confirmed" | "failed";

/**
 * What the rail says became of a charge.
 *
 * The settled amount matters as much as the status. A player can start a
 * GH₵500 deposit and approve GH₵5 on the handset, and the rail will call that
 * successful — it is, it just is not the deposit that was asked for. The
 * credit path uses the figure the rail reports rather than the one the player
 * typed in.
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
  /** Where to send the player next, when there is a page to finish on. */
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

// ---------------------------------------------------------------- AlphaPay

/**
 * AlphaPay (api.edibytes.online).
 *
 * Initialize is sent with the player's mobile money number, which makes
 * AlphaPay text that number a one-time code. Nothing reaches the handset as a
 * charge until that code is confirmed through verify-otp, which is keyed by
 * the reference alone. OUR OWN /checkout page collects the code, through the
 * proxies under /api/deposits/alphapay. A merchant account with OTP switched
 * off skips the code and goes straight to the handset prompt.
 *
 * Amounts are the MAJOR unit (50.00 is GH₵50). ALPHAPAY_UNIT=minor remains as
 * an escape hatch should that ever change. The account must whitelist every
 * domain it collects from, under Developers in the AlphaPay dashboard — that
 * is the `domain` sent here, from ALPHAPAY_DOMAIN or the site's own host. A
 * domain that is not whitelisted is refused with a 403.
 */
export const ALPHAPAY_BASE = "https://api.edibytes.online/api/payments";

/** Where AlphaPay posts its signed webhook and returns the player's browser. */
export const ALPHAPAY_CALLBACK_PATH = "/api/deposits/alphapay/callback";

function alphapayMinorUnits(): boolean {
  return (process.env.ALPHAPAY_UNIT || "major") === "minor";
}

/** AlphaPay takes the number the way it is dialled locally: 0241234567. */
function alphapayPhone(phone: string, currency: string): string {
  const digits = phone.replace(/\D/g, "");
  if (String(currency).toUpperCase() === "GHS" && digits.length >= 9) {
    return `0${digits.slice(-9)}`;
  }
  return digits;
}

export type AlphapayInit =
  | { ok: true; id?: string; phone: string; otpRequired: boolean; checkoutUrl?: string }
  | { ok: false; error: string };

/**
 * AlphaPay's own hosted checkout for a payment.
 *
 * Since 14 Nov 2026 AlphaPay guards its verify-otp call with a Cloudflare
 * Turnstile check that only its own page can pass, so a code typed into our
 * /checkout page is refused ("Refresh checkout to confirm your payment").
 * A payment that needs a code therefore finishes on AlphaPay's page, which
 * sends the player back to ALPHAPAY_CALLBACK_PATH when it is done.
 */
export function alphapayHostedUrl(reference: string, meta?: Record<string, unknown> | null): string {
  const given = meta?.checkout_url;
  if (typeof given === "string" && /^https:\/\//.test(given)) return given;
  const base = (env("ALPHAPAY_CHECKOUT_URL") ?? "https://alphapay.edibytes.online/pay").replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(reference)}`;
}

/**
 * Open the payment on AlphaPay, or re-open it. Calling this again with the
 * same reference is how a fresh code is sent, so the checkout page's "resend"
 * and "change number" both come through here.
 */
export async function alphapayInitialize(opts: {
  reference: string;
  amount: number;
  currency: string;
  phone: string;
  /** The site's own origin, e.g. https://pepstake.com. */
  origin: string;
}): Promise<AlphapayInit> {
  const unavailable = "AlphaPay is not available right now";
  const key = env("ALPHAPAY_SECRET_KEY");
  if (!key) return { ok: false, error: unavailable };

  let domain = env("ALPHAPAY_DOMAIN");
  if (!domain) {
    try {
      domain = new URL(opts.origin).hostname;
    } catch {
      return { ok: false, error: unavailable };
    }
  }

  const phone = alphapayPhone(opts.phone, opts.currency);

  try {
    const res = await fetch(`${ALPHAPAY_BASE}/initialize/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: opts.reference,
        amount: alphapayMinorUnits() ? Math.round(opts.amount * 100) : opts.amount,
        currency: opts.currency,
        domain,
        phone_number: phone,
        callback_url: `${opts.origin}${ALPHAPAY_CALLBACK_PATH}`,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.error) {
      const message = json?.error?.message ?? json?.message;
      console.error("[alphapay] initialize", res.status, message);
      return { ok: false, error: typeof message === "string" ? message : "Could not start checkout" };
    }
    return {
      ok: true,
      id: json?.id === undefined || json?.id === null ? undefined : String(json.id),
      phone,
      otpRequired: String(json?.status ?? "").toLowerCase() === "otp_required",
      // Whichever name AlphaPay gives its hosted page, if it gives one at all.
      checkoutUrl: [json?.checkout_url, json?.authorization_url, json?.payment_url].find(
        (u): u is string => typeof u === "string" && /^https:\/\//.test(u),
      ),
    };
  } catch (err) {
    console.error("[alphapay] initialize", err);
    return { ok: false, error: "Could not start checkout" };
  }
}

const alphapay: GatewayAdapter = {
  id: "alphapay",
  label: "AlphaPay",
  async start({ reference, amount, currency, phone, redirectUrl }) {
    let origin: string;
    try {
      origin = new URL(redirectUrl).origin;
    } catch {
      return { ok: false, error: "AlphaPay is not available right now" };
    }

    const init = await alphapayInitialize({ reference, amount, currency, phone, origin });
    if (!init.ok) return { ok: false, error: init.error };

    const metadata: Record<string, unknown> = {
      alphapay_id: init.id,
      phone: init.phone,
      otp_required: init.otpRequired,
      ...(init.checkoutUrl ? { checkout_url: init.checkoutUrl } : {}),
    };

    // OTP switched off on the merchant account: the prompt is already on the
    // handset, and the deposit page's own poll watches for the approval.
    if (!init.otpRequired) return { ok: true, metadata, awaitingPrompt: true };

    // The code can only be confirmed on AlphaPay's own page (see
    // alphapayHostedUrl), so that is where the player goes.
    return {
      ok: true,
      metadata,
      awaitingOtp: true,
      redirectUrl: alphapayHostedUrl(reference, metadata),
    };
  },
  async status(reference) {
    const key = env("ALPHAPAY_SECRET_KEY");
    if (!key) return { status: "pending" };
    try {
      const res = await fetch(`${ALPHAPAY_BASE}/verify/${encodeURIComponent(reference)}/`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      // An error answer says nothing about the charge, so it stays pending.
      if (!res.ok) return { status: "pending" };
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

// ---------------------------------------------------------------- PayPulse

/** PayPulse hosted checkout. Amounts are the major unit (50 is GH₵50). */
const PAYPULSE_URL = "https://paypulse.totalh.net/api/v1/payments.php";

let paypulseCookie: { value: string; until: number } | null = null;

/** The host puts a JavaScript cookie wall in front of the API. Solve it once and reuse it. */
function solvePaypulseCookie(html: string): string | null {
  const nums = [...html.matchAll(/toNumbers\("([0-9a-f]+)"\)/g)].map((match) => match[1]);
  if (nums.length < 3) return null;
  const [key, iv, encrypted] = nums.map((hex) => Buffer.from(hex, "hex"));
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("hex");
}

async function paypulseFetch(url: string, init: RequestInit = {}): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const secret = env("PAYPULSE_SECRET_KEY");
  if (!secret) return { status: 503, json: { error: "PayPulse is not configured" } };

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${secret}`);
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (paypulseCookie && paypulseCookie.until > Date.now()) {
    headers.set("Cookie", `__test=${paypulseCookie.value}`);
  }

  const send = async () => {
    const res = await fetch(url, { ...init, headers, cache: "no-store" });
    const text = await res.text();
    return { status: res.status, text };
  };

  let { status, text } = await send();
  if (text.includes("slowAES.decrypt")) {
    const value = solvePaypulseCookie(text);
    if (!value) return { status, json: null };
    paypulseCookie = { value, until: Date.now() + 5 * 60 * 60 * 1000 };
    headers.set("Cookie", `__test=${value}`);
    ({ status, text } = await send());
  }

  try {
    return { status, json: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { status, json: null };
  }
}

function paypulseStatus(raw: unknown): ChargeStatus {
  const status = String(raw ?? "").toLowerCase();
  if (["success", "successful", "paid", "completed", "confirmed"].includes(status)) return "confirmed";
  if (["failed", "cancelled", "canceled", "declined", "expired", "voided"].includes(status)) return "failed";
  return "pending";
}

const paypulse: GatewayAdapter = {
  id: "paypulse",
  label: "PayPulse",
  async start({ reference, amount, phone, email, name, redirectUrl, currency }) {
    const { status, json } = await paypulseFetch(PAYPULSE_URL, {
      method: "POST",
      body: JSON.stringify({
        amount,
        reference,
        merchant_reference: reference,
        customer: {
          name,
          phone: alphapayPhone(phone, currency),
          ...(email ? { email } : {}),
        },
        return_url: redirectUrl,
      }),
    });
    const payment = (json?.payment ?? null) as Record<string, unknown> | null;
    const checkout = payment?.checkout_url;
    if (status >= 400 || json?.ok === false || typeof checkout !== "string" || !checkout.startsWith("https://")) {
      const message = typeof json?.error === "string" ? json.error : "Could not open the payment page";
      return { ok: false, error: message };
    }
    return {
      ok: true,
      redirectUrl: checkout,
      metadata: {
        paypulse_reference: payment?.reference ?? null,
        checkout_url: checkout,
      },
    };
  },
  async status(reference) {
    const { json } = await paypulseFetch(`${PAYPULSE_URL}?reference=${encodeURIComponent(reference)}`);
    const payment = (json?.payment ?? null) as Record<string, unknown> | null;
    if (!payment) return { status: "pending" };
    const paid = Number(payment.amount);
    return {
      status: paypulseStatus(payment.status),
      paidAmount: Number.isFinite(paid) && paid > 0 ? paid : undefined,
      paidCurrency: typeof payment.currency === "string" ? payment.currency : undefined,
    };
  },
};

const ADAPTERS: Record<Gateway, GatewayAdapter> = {
  alphapay,
  paypulse,
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

export function adapterFor(gateway: Gateway): GatewayAdapter | undefined {
  return ADAPTERS[gateway];
}
