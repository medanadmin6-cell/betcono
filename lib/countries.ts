
export type PayoutRail = "mobile" | "bank";
export type Gateway =
  | "korapay"
  | "moolre"
  | "paystack"
  | "alphapay"
  | "shinobipay";

export const GATEWAYS: Gateway[] = [
  "korapay",
  "moolre",
  "paystack",
  "alphapay",
  "shinobipay",
];

export type KycKind = "bvn" | "nin" | "national_id";

export interface CountryConfig {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
  dialCode: string;
  phoneDigits: number;
  gateway: Gateway | null;
  payoutRail: PayoutRail;
  kyc: {
    kind: KycKind;
    label: string;
    pattern: RegExp;
    hint: string;
  }[];
  minFirstDeposit: number;
  minDeposit: number;
  maxDeposit: number;
  verificationAmount: number;
  withdrawQualifyCount: number;
  withdrawQualifyAmount: number;
  /** Smallest single withdrawal. 0 means no minimum. */
  minWithdraw: number;
  /** Largest single withdrawal. 0 means no maximum. */
  maxWithdraw: number;
  /** Most a single ticket can pay out, bonus included. 0 means no cap. */
  maxWin: number;
  networks: string[];
}

const BASE: Record<string, CountryConfig> = {
  GH: {
    code: "GH",
    name: "Ghana",
    currency: "GHS",
    currencySymbol: "GH₵",
    dialCode: "233",
    phoneDigits: 9,
    gateway: "alphapay",
    payoutRail: "mobile",
    kyc: [],

    minFirstDeposit: 300,
    minDeposit: 200,
    maxDeposit: 50000,
    verificationAmount: 300,

    // Two qualifying deposits of GH₵300, asked only after a win.
    withdrawQualifyCount: 2,
    withdrawQualifyAmount: 300,

    minWithdraw: 3000,
    maxWithdraw: 75000,
    maxWin: 500000,

    networks: [
      "MTN Mobile Money",
      "Telecel Cash",
      "AirtelTigo Money",
    ],
  },

  NG: {
    code: "NG",
    name: "Nigeria",
    currency: "NGN",
    currencySymbol: "₦",
    dialCode: "234",
    phoneDigits: 10,
    gateway: "alphapay",
    payoutRail: "bank",
    kyc: [
      {
        kind: "bvn",
        label: "BVN",
        pattern: /^\d{11}$/,
        hint: "11 digits",
      },
      {
        kind: "nin",
        label: "NIN",
        pattern: /^\d{11}$/,
        hint: "11 digits",
      },
    ],
    minFirstDeposit: 5000,
    minDeposit: 5000,
    maxDeposit: 1250000,
    verificationAmount: 7500,
    withdrawQualifyCount: 4,
    withdrawQualifyAmount: 7500,
    minWithdraw: 0,
    maxWithdraw: 0,
    maxWin: 0,
    networks: ["Bank transfer"],
  },

  KE: {
    code: "KE",
    name: "Kenya",
    currency: "KES",
    currencySymbol: "KSh",
    dialCode: "254",
    phoneDigits: 9,
    gateway: null,
    payoutRail: "mobile",
    kyc: [
      {
        kind: "national_id",
        label: "National ID",
        pattern: /^\d{7,8}$/,
        hint: "7 or 8 digits",
      },
    ],
    minFirstDeposit: 50,
    minDeposit: 10,
    maxDeposit: 150000,
    verificationAmount: 2000,
    withdrawQualifyCount: 4,
    withdrawQualifyAmount: 2000,
    minWithdraw: 0,
    maxWithdraw: 0,
    maxWin: 0,
    networks: ["M-Pesa", "Airtel Money"],
  },

  ZA: {
    code: "ZA",
    name: "South Africa",
    currency: "ZAR",
    currencySymbol: "R",
    dialCode: "27",
    phoneDigits: 9,
    gateway: null,
    payoutRail: "bank",
    kyc: [
      {
        kind: "national_id",
        label: "ID number",
        pattern: /^\d{13}$/,
        hint: "13 digits",
      },
    ],
    minFirstDeposit: 50,
    minDeposit: 10,
    maxDeposit: 50000,
    verificationAmount: 500,
    withdrawQualifyCount: 4,
    withdrawQualifyAmount: 500,
    minWithdraw: 0,
    maxWithdraw: 0,
    maxWin: 0,
    networks: ["Bank transfer"],
  },
};

function num(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw === "") return fallback;

  const parsed = Number(raw);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function gatewayEnv(
  name: string,
  fallback: Gateway | null
): Gateway | null {
  const raw = process.env[name];

  return GATEWAYS.includes(raw as Gateway)
    ? (raw as Gateway)
    : fallback;
}

export function getCountry(
  code: string | null | undefined
): CountryConfig {
  const cc = (code ?? "GH").toUpperCase();
  const base = BASE[cc] ?? BASE.GH;

  return {
    ...base,

    gateway: gatewayEnv(
      `GATEWAY_${base.code}`,
      base.gateway
    ),

    minFirstDeposit: num(
      `MIN_FIRST_DEPOSIT_${base.code}`,
      base.minFirstDeposit
    ),

    minDeposit: num(
      `MIN_DEPOSIT_${base.code}`,
      base.minDeposit
    ),

    maxDeposit: num(
      `MAX_DEPOSIT_${base.code}`,
      base.maxDeposit
    ),

    verificationAmount: num(
      `VERIFICATION_AMOUNT_${base.code}`,
      base.verificationAmount
    ),

    withdrawQualifyCount: num(
      `WITHDRAW_QUALIFY_COUNT_${base.code}`,
      base.withdrawQualifyCount
    ),

    withdrawQualifyAmount: num(
      `WITHDRAW_QUALIFY_AMOUNT_${base.code}`,
      base.withdrawQualifyAmount
    ),

    minWithdraw: num(`MIN_WITHDRAW_${base.code}`, base.minWithdraw),
    maxWithdraw: num(`MAX_WITHDRAW_${base.code}`, base.maxWithdraw),
    maxWin: num(`MAX_WIN_${base.code}`, base.maxWin),
  };
}

/** A ticket's payout after the market's max-win cap. */
export function capWin(win: number, maxWin: number): number {
  return maxWin > 0 ? Math.min(win, maxWin) : win;
}

export function allCountries(): CountryConfig[] {
  return Object.keys(BASE).map((c) => getCountry(c));
}

export function normalisePhone(
  input: string,
  cc: string
): string | null {
  const country = getCountry(cc);

  let d = (input || "").replace(/\D/g, "");

  if (d.startsWith("00")) d = d.slice(2);

  if (d.startsWith(country.dialCode)) {
    d = d.slice(country.dialCode.length);
  }

  d = d.replace(/^0+/, "");

  if (d.length !== country.phoneDigits) return null;

  return country.dialCode + d;
}

export function validateKyc(
  value: string,
  cc: string
): { ok: boolean; kind?: KycKind; error?: string } {
  const country = getCountry(cc);

  if (!country.kyc.length) return { ok: true };

  const v = (value || "").trim().toUpperCase();

  for (const k of country.kyc) {
    if (k.pattern.test(v)) {
      return { ok: true, kind: k.kind };
    }
  }

  const labels = country.kyc
    .map((k) => `${k.label} (${k.hint})`)
    .join(" or ");

  return {
    ok: false,
    error: `Enter a valid ${labels}`,
  };
}

export function formatMoney(
  amount: number,
  currency: string
): string {
  const c = Object.values(BASE).find(
    (x) => x.currency === currency
  );

  const symbol = c?.currencySymbol ?? currency;

  return `${symbol}${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function maskPhoneTail(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");

  if (d.length < 6) return d;

  const local = d.length > 9 ? d.slice(-9) : d;

  return `${local.slice(0, 2)}****${local.slice(-3)}`;
}
