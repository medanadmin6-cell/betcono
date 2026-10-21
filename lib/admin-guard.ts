import { cookies } from "next/headers";
import { ADMIN_COOKIE, isValidAdminToken } from "./auth";
import { currentPartner } from "./partner";

/**
 * The admin cookie check for route handlers.
 *
 * This lives apart from lib/auth so that module stays free of next/headers and
 * can be imported by middleware, which runs before a request context exists.
 */

export type AdminRole = "admin" | "sub";

/**
 * The signed-in console role, or null for no valid session.
 *
 * The operator's cookie is the full tier. The sub tier is a partner: an
 * approved sub_admins account signed into the partner portal. Their portal
 * cookie is the session — there is no separate sub-admin login.
 */
export async function adminRole(): Promise<AdminRole | null> {
  const jar = await cookies();
  if (isValidAdminToken(jar.get(ADMIN_COOKIE)?.value)) return "admin";

  const partner = await currentPartner();
  if (partner?.approved) return "sub";

  return null;
}

/** Full operator only. Every admin route uses this unless it says otherwise. */
export async function requireAdmin(): Promise<boolean> {
  const jar = await cookies();
  return isValidAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

/**
 * Custom matches are the one concern a partner may operate, so only the
 * custom-matches routes (and the crest upload they rely on) accept this.
 */
export async function requireCustomMatchAdmin(): Promise<boolean> {
  return (await adminRole()) !== null;
}
