"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCountry } from "@/lib/countries";
import { AuthLayout, CountryBar, PhoneField, PrimaryButton } from "@/components/AuthFields";

/**
 * Password reset. There is no reset rail in the platform yet (no email
 * provider is wired and SMS is send-only), so this collects the number and
 * routes the player to support rather than pretending to send a code.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState("GH");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);

  const country = getCountry(countryCode);
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the number on your account and our team will help you get back in."
      onClose={() => router.push("/login")}
      footer={
        <Link href="/login" className="block text-center text-[13px] font-bold text-[var(--accent)]">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            Our team will verify your number and reset the password for you. A person handles this,
            so it is not instant.
          </p>
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-[5px] bg-[var(--accent)] py-3 text-center text-[15px] font-black text-[var(--accent-ink)]"
            >
              Message support on WhatsApp
            </a>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // The button never greys out, so the check lives here.
            if (!phone.trim()) return;
            setSent(true);
          }}
          className="space-y-4"
        >
          <CountryBar country={country} onChange={setCountryCode} />
          <PhoneField country={country} value={phone} onChange={setPhone} autoFocus />
          <PrimaryButton type="submit">Continue</PrimaryButton>
        </form>
      )}
    </AuthLayout>
  );
}
