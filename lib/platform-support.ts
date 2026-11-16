import type { SupabaseClient } from "@supabase/supabase-js";
import { supportDigits } from "@/lib/support-numbers";

export interface SupportLines {
  phone: string | null;
  whatsapp: string | null;
}

/** The operator's support lines. A missing WhatsApp key still uses the deployment default. */
export async function platformSupport(supabase: SupabaseClient): Promise<SupportLines> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["support_phone", "support_whatsapp"]);

  if (error) {
    return { phone: null, whatsapp: supportDigits(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP) };
  }

  const stored = new Map((data ?? []).map((row) => [row.key, row.value as string | null]));
  const phone = stored.has("support_phone") ? supportDigits(stored.get("support_phone")) : null;
  const whatsapp = stored.has("support_whatsapp")
    ? supportDigits(stored.get("support_whatsapp"))
    : supportDigits(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP);
  return { phone, whatsapp };
}
