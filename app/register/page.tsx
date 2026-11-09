"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/store";
import { getCountry } from "@/lib/countries";
import {
  AuthLayout,
  CountryBar,
  FieldLabel,
  PhoneField,
  PasswordField,
  Check,
  PrimaryButton,
} from "@/components/AuthFields";

function RegisterForm() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const refFromUrl = useSearchParams().get("ref") ?? "";

  const [countryCode, setCountryCode] = useState("GH");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [kycValue, setKycValue] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [codeInput, setCodeInput] = useState(refFromUrl.toUpperCase());
  const [checking, setChecking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = getCountry(countryCode);

  const acceptCode = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) {
      setReferralCode("");
      setError("Enter your referral code");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/register?code=${encodeURIComponent(code)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReferralCode("");
        setError(json.error ?? "That referral code is not valid");
        return;
      }
      setReferralCode(code);
      setCodeInput(code);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (refFromUrl.trim()) void acceptCode(refFromUrl);
    // The link is checked once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name");
    if (!phone.trim()) return setError("Enter your mobile number");
    if (!password) return setError("Choose a password");
    if (!referralCode.trim()) return setError("Enter your referral code");
    if (!agreed) return setError("Accept the terms to continue");

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, password, countryCode, kycValue, referralCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not create your account");
        return;
      }
      signIn(json.user);
      // Straight to the board. A new player should see what they can bet on
      // before being asked for money.
      router.push("/");
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create an account"
      subtitle={
        referralCode
          ? "It takes a minute. You can deposit later."
          : "Registration is by referral code only."
      }
      onClose={() => router.push("/")}
      footer={
        <p className="text-center text-[13px] text-[var(--text-muted)]">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-[var(--accent)]">
            Log in
          </Link>
        </p>
      }
    >
      {!referralCode ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void acceptCode(codeInput);
          }}
          className="space-y-4"
        >
          <ShellInput
            id="reg-ref"
            label="Referral code"
            value={codeInput}
            onChange={(v) => setCodeInput(v.toUpperCase())}
            placeholder="Ask the partner who invited you"
            autoFocus
            required
          />
          <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
            An account can only be opened with a partner&apos;s referral code.
          </p>
          {error && (
            <p className="rounded bg-[var(--lose-bg)] px-3 py-2.5 text-[13px] text-[var(--lose)]">
              {error}
            </p>
          )}
          <PrimaryButton type="submit" disabled={checking}>
            {checking ? "Checking…" : "Continue"}
          </PrimaryButton>
        </form>
      ) : (
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-[5px] bg-[var(--surface)] px-3 py-2.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Referral code
            </p>
            <p className="text-[15px] font-black tracking-wide text-[var(--text-bright)]">{referralCode}</p>
          </div>
          <button
            type="button"
            onClick={() => setReferralCode("")}
            className="text-[12px] font-bold text-[var(--accent)]"
          >
            Change
          </button>
        </div>
        <CountryBar country={country} onChange={setCountryCode} />
        <PhoneField country={country} value={phone} onChange={setPhone} autoFocus />

        <ShellInput
          id="reg-name"
          label="Full name"
          value={name}
          onChange={setName}
          autoComplete="name"
        />

        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="At least 6 characters"
        />

        {country.kyc.length > 0 && (
          <ShellInput
            id="reg-kyc"
            label={country.kyc[0].label}
            value={kycValue}
            onChange={setKycValue}
            placeholder={country.kyc[0].hint}
          />
        )}

        <Check
          checked={agreed}
          onChange={setAgreed}
          label={
            <>
              I am 18 or older and accept the{" "}
              <Link href="/terms" className="font-bold text-[var(--accent)] underline">
                terms
              </Link>
            </>
          }
        />

        {error && (
          <p className="rounded bg-[var(--lose-bg)] px-3 py-2.5 text-[13px] text-[var(--lose)]">
            {error}
          </p>
        )}

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </PrimaryButton>
      </form>
      )}
    </AuthLayout>
  );
}

/** A labelled plain text input, matching the phone and password fields. */
function ShellInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required={required}
        className="w-full rounded-[5px] border border-[var(--field-line)] bg-[var(--input)] px-3 py-2.5 text-[15px] text-[var(--input-ink)] outline-none placeholder:text-[var(--input-placeholder)] focus:border-[var(--accent)]"
      />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
