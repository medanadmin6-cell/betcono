"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/store";
import { getCountry, normalisePhone } from "@/lib/countries";
import {
  AuthLayout,
  CountryBar,
  PhoneField,
  PasswordField,
  PrimaryButton,
} from "@/components/AuthFields";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const signIn = useSession((s) => s.signIn);

  const [countryCode, setCountryCode] = useState("GH");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = getCountry(countryCode);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password) {
      setError("Enter your number and password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Send the number in full international form so the server does not have
      // to guess which market a bare local number belongs to.
      const identifier = normalisePhone(phone, countryCode) ?? phone;

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Wrong login details");
        return;
      }
      signIn(json.user);
      router.push(next);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Log in"
      subtitle="Use the mobile number you registered with."
      onClose={() => router.push("/")}
      footer={
        <div className="space-y-3 text-center text-[13px] text-[var(--text-muted)]">
          <p>
            New to BetZone?{" "}
            <Link href="/register" className="font-bold text-[var(--accent)]">
              Create an account
            </Link>
          </p>
          <p>
            To deactivate or reactivate your account,{" "}
            <Link href="/account-status" className="font-bold text-[var(--accent)]">
              go to account status
            </Link>
            .
          </p>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <CountryBar country={country} onChange={setCountryCode} />
        <PhoneField country={country} value={phone} onChange={setPhone} autoFocus />
        <PasswordField value={password} onChange={setPassword} />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-[12px] font-bold text-[var(--accent)]">
            Forgot password?
          </Link>
        </div>

        {error && (
          <p className="rounded bg-[var(--lose-bg)] px-3 py-2.5 text-[13px] text-[var(--lose)]">
            {error}
          </p>
        )}

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </PrimaryButton>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
