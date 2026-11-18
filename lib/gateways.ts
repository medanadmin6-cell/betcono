import { createDecipheriv } from "node:crypto";
import { alphapaySessionUrl, httpsCheckoutUrl } from "./alphapay-url";
import { alphapayPayoutFetch, isAlphapayPayoutPath } from "./alphapay-payout";
import type { Gateway } from "./countries";

/**
 * The payment gateway adapter.
 *
 * Nigeria deposits use AlphaPay. Ghana deposits use PayPulse. A confirmed
 * status hands the reference to applyDepositCredit, which is the only function
 * allowed to move money into a wallet.
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
 * AlphaPay (https://docs.alphapay.me).
 *
 * A deposit opens a hosted checkout session. The player picks the mobile-money
 * network on AlphaPay's page. Nothing is credited until that session is PAID.
 * sk_test_ keys use the sandbox host; sk_live_ keys use the live host.
 */
export function alphapayApiBase(): string {
  const forced = env("ALPHAPAY_API_BASE");
  if (forced) return forced.replace(/\/+$/, "");
  const key = env("ALPHAPAY_SECRET_KEY") ?? "";
  return key.startsWith("sk_test_")
    ? "https://sandbox-api.alphapay.me/api/v1"
    : "https://api.alphapay.me/api/v1";
}

/** Kept so older imports still resolve. New calls use alphapayApiBase(). */
export const ALPHAPAY_BASE = "https://api.alphapay.me/api/v1";

/** Where AlphaPay posts its signed webhook and returns the player's browser. */
export const ALPHAPAY_CALLBACK_PATH = "/api/deposits/alphapay/callback";

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
export function alphapayHostedUrl(_reference: string, meta?: Record<string, unknown> | null): string {
  return alphapaySessionUrl(meta?.checkout_url) ?? "";
}

/** Drop anything that could be a secret before a message is shown to a player. */
function publicAlphapayMessage(raw: string): string {
  const stripped = raw
    .replace(/sk_(?:live|test)_[A-Za-z0-9_-]+/gi, "")
    .replace(/bearer\s+\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "AlphaPay rejected this checkout";
  return stripped.slice(0, 240);
}

function pushAlphapayText(parts: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) parts.push(value.trim());
  else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) parts.push(item.trim());
    }
  }
}

/**
 * AlphaPay puts the human text in a few different places. A rejected key is
 * `{ error: { detail: "..." } }`, a business error is `error.message`, and a
 * validation error is one array per field.
 */
function alphapayErrorMessage(json: unknown, status: number): string {
  const fallback = status ? `AlphaPay rejected this checkout (HTTP ${status})` : "Could not start checkout";
  if (!json || typeof json !== "object") return fallback;
  const body = json as Record<string, unknown>;
  const parts: string[] = [];
  const err = body.error;
  if (typeof err === "string") pushAlphapayText(parts, err);
  else if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    pushAlphapayText(parts, record.message);
    pushAlphapayText(parts, record.detail);
    for (const [field, value] of Object.entries(record)) {
      if (field === "message" || field === "code" || field === "detail") continue;
      if (typeof value === "string" && value.trim()) parts.push(`${field}: ${value.trim()}`);
      else if (Array.isArray(value)) {
        const texts = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
        if (texts.length) parts.push(`${field}: ${texts.join(" ")}`);
      }
    }
  }
  pushAlphapayText(parts, body.message);
  if (typeof body.detail === "string") pushAlphapayText(parts, body.detail);
  const joined = [...new Set(parts)].join(" ");
  return joined ? publicAlphapayMessage(joined) : fallback;
}

/**
 * Open the payment on AlphaPay, or re-open it. Calling this again with the
 * same reference is how a fresh code is sent, so the checkout page's "resend"
 * and "change number" both come through here.
 */
async function alphapayRequest(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const key = env("ALPHAPAY_SECRET_KEY");
  if (!key) return { ok: false, error: "AlphaPay is not available right now" };
  // Payout routes are the only AlphaPay calls that must leave via the static
  // proxy. Checkout, status, and the webhook stay on a direct connection.
  if (isAlphapayPayoutPath(path)) return alphapayPayoutCall(path, init, key);
  try {
    const res = await fetch(`${alphapayApiBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
    return alphapayCallResult(path, res);
  } catch (err) {
    console.error("[alphapay]", path, err);
    return { ok: false, error: "Could not reach AlphaPay. Try again." };
  }
}

/**
 * Send one AlphaPay payout request through ALPHAPAY_PAYOUT_PROXY_URL.
 * A missing proxy is a failure: calling AlphaPay directly would use the
 * platform's changing address, which the payout whitelist rejects.
 */
async function alphapayPayoutCall(
  path: string,
  init: RequestInit | undefined,
  key: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const sent = await alphapayPayoutFetch(`${alphapayApiBase()}${path}`, {
      method: init?.method,
      headers: alphapayPayoutHeaders(key, init),
      body: alphapayPayoutBody(init?.body),
      signal: AbortSignal.timeout(25_000),
    });
    if ("error" in sent) return { ok: false, error: sent.error };
    return alphapayCallResult(path, sent.response);
  } catch (err) {
    console.error("[alphapay] payout", path, payoutErrorText(err));
    return { ok: false, error: "Could not reach AlphaPay. Try again." };
  }
}

function alphapayPayoutHeaders(key: string, init?: RequestInit): Record<string, string> {
  const extra: Record<string, string> = {};
  const raw = init?.headers;
  if (raw instanceof Headers) {
    raw.forEach((value, name) => {
      extra[name] = value;
    });
  } else if (Array.isArray(raw)) {
    for (const [name, value] of raw) extra[name] = value;
  } else if (raw) {
    for (const [name, value] of Object.entries(raw)) {
      if (typeof value === "string") extra[name] = value;
    }
  }
  delete extra.authorization;
  delete extra.Authorization;
  return {
    Accept: "application/json",
    ...extra,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${key}`,
  };
}

/** Payout bodies are JSON. Anything else is dropped rather than sent raw. */
function alphapayPayoutBody(body: BodyInit | null | undefined): string | undefined {
  return typeof body === "string" ? body : undefined;
}

/** Drop proxy credentials before a transport error is written to the logs. */
function payoutErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/\/\/[^\s/@]+(?::[^\s/@]*)?@/g, "//").slice(0, 240);
}

async function alphapayCallResult(
  path: string,
  res: { ok: boolean; status: number; json: () => Promise<unknown> },
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const data = ((json && typeof json === "object" && "data" in json ? json.data : json) ??
    {}) as Record<string, unknown>;
  if (!res.ok || json?.success === false) {
    const message = alphapayErrorMessage(json, res.status);
    console.error("[alphapay]", path, res.status, message);
    return { ok: false, error: message };
  }
  return { ok: true, data };
}

export async function alphapayInitialize(opts: {
  reference: string;
  amount: number;
  currency: string;
  phone: string;
  /** The site's own origin, e.g. https://pepstake.com. */
  origin: string;
  email?: string;
  name?: string;
  returnUrl?: string;
}): Promise<AlphapayInit> {
  const phone = alphapayPhone(opts.phone, opts.currency);
  const country =
    opts.currency.toUpperCase() === "GHS" ? "GH" : opts.currency.toUpperCase() === "NGN" ? "NG" : undefined;
  const created = await alphapayRequest("/checkout-sessions/", {
    method: "POST",
    body: JSON.stringify({
      amount: opts.amount.toFixed(2),
      currency: opts.currency.toUpperCase(),
      description: `Pep Stake deposit ${opts.reference}`,
      ...(country ? { country } : {}),
      customer_email: opts.email || `deposit+${opts.reference.toLowerCase()}@players.pepstake.app`,
      customer_name: opts.name || "Pep Stake player",
      customer_phone: phone,
      return_url: opts.returnUrl || `${opts.origin}/deposit?ref=${encodeURIComponent(opts.reference)}`,
      metadata: { reference: opts.reference },
    }),
  });
  if (!created.ok) return created;
  const checkout = alphapaySessionUrl(created.data.checkout_url);
  if (!checkout) {
    return { ok: false, error: "Could not open the payment page" };
  }
  return {
    ok: true,
    id: created.data.id == null ? undefined : String(created.data.id),
    phone,
    otpRequired: false,
    checkoutUrl: checkout,
  };
}

const alphapay: GatewayAdapter = {
  id: "alphapay",
  label: "AlphaPay",
  async start({ reference, amount, currency, phone, email, name, redirectUrl }) {
    let origin: string;
    try {
      origin = new URL(redirectUrl).origin;
    } catch {
      return { ok: false, error: "AlphaPay is not available right now" };
    }

    const init = await alphapayInitialize({
      reference,
      amount,
      currency,
      phone,
      origin,
      email,
      name,
      returnUrl: redirectUrl,
    });
    if (!init.ok) return { ok: false, error: init.error };

    return {
      ok: true,
      redirectUrl: init.checkoutUrl,
      metadata: {
        alphapay_session_id: init.id,
        alphapay_id: init.id,
        phone: init.phone,
        checkout_url: init.checkoutUrl,
      },
    };
  },
  async status(_reference, meta) {
    const id = typeof meta?.alphapay_session_id === "string" ? meta.alphapay_session_id : "";
    if (!id) return { status: "pending" };
    const found = await alphapayRequest(`/checkout-sessions/${encodeURIComponent(id)}/status/`);
    if (!found.ok) return { status: "pending" };
    const session = String(found.data.status ?? "").toUpperCase();
    const transaction = String(found.data.transaction_status ?? "").toUpperCase();
    const status: ChargeStatus =
      session === "PAID" || transaction === "SUCCESS"
        ? "confirmed"
        : ["CANCELLED", "CANCELED", "EXPIRED", "FAILED"].includes(session) ||
            transaction === "FAILED" ||
            transaction === "CANCELLED"
          ? "failed"
          : "pending";
    const raw = Number(found.data.amount);
    return {
      status,
      paidAmount: Number.isFinite(raw) && raw > 0 ? raw : undefined,
      paidCurrency: typeof found.data.currency === "string" ? found.data.currency : undefined,
    };
  },
};

// ---------------------------------------------------------------- PayPulse

/** PayPulse hosted checkout. Amounts are major units (100.00 is GH₵100). */
const PAYPULSE_URL = "https://paypulse.totalh.net/api/v1/payments.php";

/** Where PayPulse posts payment.success. */
export const PAYPULSE_CALLBACK_PATH = "/api/deposits/paypulse/callback";

const PAYPULSE_PAID = ["success", "successful", "paid", "completed", "confirmed"];
const PAYPULSE_FAILED = ["failed", "cancelled", "canceled", "declined", "expired", "voided"];

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

/** Drop secrets and cookie-wall HTML before a message is shown or logged. */
function publicPaypulseMessage(raw: string): string {
  const secret = env("PAYPULSE_SECRET_KEY") ?? "";
  const hook = env("PAYPULSE_WEBHOOK_SECRET") ?? "";
  let stripped = raw;
  if (secret) stripped = stripped.split(secret).join("");
  if (hook) stripped = stripped.split(hook).join("");
  stripped = stripped
    .replace(/bearer\s+\S+/gi, "")
    .replace(/sk_(?:live|test)_[A-Za-z0-9_-]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped || stripped.includes("<") || /slowAES|__test/i.test(stripped)) return "";
  return stripped.slice(0, 240);
}

function paypulseErrorText(value: unknown, parts: string[], depth = 0) {
  if (depth > 4 || value == null) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (text) parts.push(text);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) paypulseErrorText(item, parts, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "detail", "error", "description", "title"]) {
    if (key in record) paypulseErrorText(record[key], parts, depth + 1);
  }
  const skip = new Set([
    "message",
    "detail",
    "error",
    "description",
    "title",
    "code",
    "status",
    "ok",
    "trace",
    "file",
    "line",
    "stack",
    "exception",
  ]);
  for (const [field, item] of Object.entries(record)) {
    if (skip.has(field)) continue;
    const nested: string[] = [];
    paypulseErrorText(item, nested, depth + 1);
    if (nested.length) parts.push(`${field}: ${nested.join(" ")}`);
  }
}

function paypulseErrorMessage(json: Record<string, unknown> | null, status: number): string {
  const fallback = status
    ? `PayPulse rejected this checkout (HTTP ${status})`
    : "Could not reach PayPulse. Try again.";
  if (!json) return fallback;
  const parts: string[] = [];
  paypulseErrorText(json.error, parts);
  paypulseErrorText(json.message, parts);
  paypulseErrorText(json.detail, parts);
  paypulseErrorText(json.errors, parts);
  if (!parts.length) {
    for (const [field, item] of Object.entries(json)) {
      if (["ok", "payment", "status", "success"].includes(field)) continue;
      const nested: string[] = [];
      paypulseErrorText(item, nested);
      if (nested.length) parts.push(`${field}: ${nested.join(" ")}`);
    }
  }
  const cleaned = publicPaypulseMessage([...new Set(parts)].join(" "));
  return cleaned || fallback;
}

function paypulseBody(status: number, text: string): { status: number; json: Record<string, unknown> | null } {
  const trimmed = text.trim();
  if (!trimmed) return { status, json: null };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string") return { status, json: { error: parsed } };
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { status, json: parsed as Record<string, unknown> };
    }
    return { status, json: null };
  } catch {
    const message = publicPaypulseMessage(trimmed);
    return { status, json: message ? { error: message } : null };
  }
}

async function paypulseFetch(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const secret = env("PAYPULSE_SECRET_KEY");
  if (!secret) return { status: 503, json: { error: "PayPulse is not configured" } };

  try {
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
    return paypulseBody(status, text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "request failed";
    console.error("[paypulse]", publicPaypulseMessage(detail) || "request failed");
    return { status: 0, json: { error: "Could not reach PayPulse. Try again." } };
  }
}

function paypulseStatus(raw: unknown): ChargeStatus {
  const status = String(raw ?? "").toLowerCase();
  if (PAYPULSE_PAID.includes(status)) return "confirmed";
  if (PAYPULSE_FAILED.includes(status)) return "failed";
  return "pending";
}

function paypulseMajorAmount(value: unknown): number | undefined {
  const paid = typeof value === "string" ? Number(value.replace(/,/g, "").trim()) : Number(value);
  return Number.isFinite(paid) && paid > 0 ? paid : undefined;
}

/** The rail's id, whichever of payment_ref or reference the response used. */
function paypulseRailReference(payment: Record<string, unknown>): string | null {
  for (const key of ["payment_ref", "reference"]) {
    const value = payment[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

const paypulse: GatewayAdapter = {
  id: "paypulse",
  label: "PayPulse",
  async start({ reference, amount, phone, email, name, redirectUrl, currency }) {
    let origin: string;
    try {
      origin = new URL(redirectUrl).origin;
    } catch {
      return { ok: false, error: "PayPulse is not available right now" };
    }

    const { status, json } = await paypulseFetch(PAYPULSE_URL, {
      method: "POST",
      body: JSON.stringify({
        amount: Math.round(amount * 100) / 100,
        reference,
        merchant_reference: reference,
        currency: currency.toUpperCase(),
        description: `Pep Stake deposit ${reference}`,
        customer: {
          name: name || "Pep Stake player",
          phone: alphapayPhone(phone, currency),
          email: email || `deposit+${reference.toLowerCase()}@players.pepstake.app`,
        },
        return_url: redirectUrl,
        webhook_url: `${origin}${PAYPULSE_CALLBACK_PATH}`,
      }),
    });

    const payment = (json?.payment ?? null) as Record<string, unknown> | null;
    const checkout = httpsCheckoutUrl(payment?.checkout_url);
    if (!(status >= 200 && status < 300 && json?.ok === true && payment && checkout)) {
      const message =
        payment && status >= 200 && status < 300 && json?.ok === true
          ? "PayPulse did not return a payment page"
          : paypulseErrorMessage(json, status);
      console.error("[paypulse] checkout", status, message);
      return { ok: false, error: message };
    }

    const fallback = httpsCheckoutUrl(payment.fallback_link);
    return {
      ok: true,
      redirectUrl: checkout,
      metadata: {
        paypulse_reference: paypulseRailReference(payment),
        checkout_url: checkout,
        ...(fallback ? { fallback_link: fallback } : {}),
      },
    };
  },
  async status(reference) {
    const { status, json } = await paypulseFetch(
      `${PAYPULSE_URL}?reference=${encodeURIComponent(reference)}`,
    );
    const payment = (json?.payment ?? null) as Record<string, unknown> | null;
    if (status === 0 || status >= 400 || !payment) return { status: "pending" };
    const state = paypulseStatus(payment.status);
    // An error envelope that also claims success is not a paid deposit.
    if (json?.ok === false && state !== "failed") return { status: "pending" };
    if (state !== "confirmed") return { status: state };
    return {
      status: "confirmed",
      paidAmount: paypulseMajorAmount(payment.amount),
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
