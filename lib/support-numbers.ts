/** Digits only, or null when the value is empty or not a usable phone number. */
export function supportDigits(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function telHref(digits: string): string {
  return `tel:+${digits}`;
}

export function whatsappHref(digits: string, name?: string | null): string {
  const who = name?.trim() ? ` My name is ${name.trim()}.` : "";
  const text = `Hello, I need help with my Pep Stake account.${who}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
