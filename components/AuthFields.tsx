"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, X, ChevronDown, Check as CheckGlyph } from "lucide-react";
import { allCountries, type CountryConfig } from "@/lib/countries";
import { BrandIcon } from "@/components/icons";

/**
 * The auth form furniture: the page frame the login, register and reset
 * screens share, a country row with an inline picker, and single bordered
 * fields that match the rest of the app's inputs.
 */

/**
 * Flags are drawn art, not emoji: Windows ships no regional-indicator glyphs,
 * so an emoji flag degrades to the bare letters "GH" there.
 */
export function Flag({ code, size = 18 }: { code: string; size?: number }) {
  return (
    <Image
      src={`/flags/${code.toLowerCase()}.svg`}
      alt=""
      width={size}
      height={Math.round((size * 2) / 3)}
      className="shrink-0 rounded-[2px]"
    />
  );
}

/**
 * The auth page frame: a slim navy bar with the wordmark and a close control,
 * then a centred card holding the form.
 */
export function AuthLayout({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="bg-[var(--chrome)]">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Pep Stake home">
            <BrandIcon size={26} className="text-[#9ff611]" />
            <span className="text-[18px] font-black tracking-tight text-white">
              Pep <span className="text-[#9ff611]">Stake</span>
            </span>
          </Link>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X size={20} strokeWidth={2} />
            </button>
          )}
        </div>
      </header>

      <main className="px-4 pb-16 pt-8">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-[20px] font-black text-[var(--text-bright)]">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-[var(--text-muted)]">{subtitle}</p>}

          <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--bg-elevated)] p-4 sm:p-5">
            {children}
          </div>

          {footer && <div className="mt-5">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/**
 * Country row with an inline picker. `onClose` is still accepted for older
 * callers; the close control now lives in AuthLayout's header.
 */
export function CountryBar({
  country,
  onChange,
}: {
  country: CountryConfig;
  onChange: (code: string) => void;
  onClose?: () => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="relative">
      <FieldLabel>Country</FieldLabel>
      <div>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          className="flex w-full items-center gap-2 rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-left focus:border-[var(--accent)] focus:outline-none"
        >
          <Flag code={country.code} size={20} />
          <span className="flex-1 text-[14px] font-semibold text-[var(--input-ink)]">{country.name}</span>
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">Change</span>
          <ChevronDown size={15} strokeWidth={2.2} className="text-[var(--text-muted)]" />
        </button>
      </div>

      {picking && (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-[var(--field-line)] bg-[var(--bg-elevated)] shadow-md">
          {allCountries().map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => {
                  onChange(c.code);
                  setPicking(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] hover:bg-[var(--surface)]"
                style={c.code === country.code ? { color: "var(--accent)" } : undefined}
              >
                <Flag code={c.code} />
                <span className="flex-1 font-semibold">{c.name}</span>
                <span className="text-[12px] tabular-nums text-[var(--text-muted)]">+{c.dialCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Field label, shared so every auth input reads the same. */
export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-bold text-[var(--text-muted)]">
      {children}
    </label>
  );
}

/** Phone field: dial-code prefix, the number, and a clear control. */
export function PhoneField({
  country,
  value,
  onChange,
  autoFocus,
}: {
  country: CountryConfig;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <FieldLabel htmlFor="auth-phone">Mobile number</FieldLabel>
      <div className="flex items-center rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] focus-within:border-[var(--accent)]">
        <span className="shrink-0 border-r border-[var(--field-line)] px-3 py-2.5 text-[14px] font-semibold tabular-nums text-[var(--text-muted)]">
          +{country.dialCode}
        </span>
        <div className="relative flex-1">
          <input
            id="auth-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
            className="w-full bg-transparent py-2.5 pl-3 pr-8 text-[15px] tabular-nums text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)]"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Clear phone number"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--input-placeholder)]"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Password field with the show/hide control inside the border. */
export function PasswordField({
  value,
  onChange,
  autoComplete = "current-password",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div>
      <FieldLabel htmlFor="auth-password">Password</FieldLabel>
      <div className="flex items-center rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] focus-within:border-[var(--accent)]">
        <input
          id="auth-password"
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)]"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="shrink-0 px-3 text-[var(--text-muted)]"
        >
          {shown ? <Eye size={18} strokeWidth={1.8} /> : <EyeOff size={18} strokeWidth={1.8} />}
        </button>
      </div>
    </div>
  );
}

/** Square checkbox with an accent tick. */
export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2">
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] transition-colors"
        style={{
          background: checked ? "var(--accent)" : "var(--input)",
          boxShadow: `inset 0 0 0 1px ${checked ? "var(--accent)" : "var(--field-line)"}`,
        }}
      >
        {checked && <CheckGlyph size={12} strokeWidth={3.4} className="text-[var(--accent-ink)]" />}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="text-[13px] text-[var(--text)]">{label}</span>
    </label>
  );
}

/**
 * The full-width primary action for Log in and Register.
 *
 * It stays in the accent colour in every state. A faded version reads as a
 * broken button, so an empty form is answered by the form saying what is
 * missing, not by the button going out. The only time it changes is while a
 * submission is in flight, and then it says so.
 */
export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full rounded-[5px] bg-[var(--accent)] py-3 text-[15px] font-black text-[var(--accent-ink)] disabled:cursor-wait"
    >
      {children}
    </button>
  );
}
