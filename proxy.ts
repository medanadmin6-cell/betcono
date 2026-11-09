import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, PARTNER_COOKIE, isValidAdminToken } from "@/lib/auth";

/**
 * Keeps unauthenticated visitors away from /admin before the page shell loads.
 * Every admin API route re-checks the cookie independently, so this is a
 * convenience rather than the security boundary.
 *
 * Partners are the sub-admins. Their portal session may open custom matches.
 * Any other /admin path sends them to the partner dashboard. Verifying that
 * session needs the database, so here only the cookie's presence is checked
 * and the custom-matches API routes do the real verification.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin/login") return NextResponse.next();

  if (pathname.startsWith("/admin")) {
    if (isValidAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)) {
      return NextResponse.next();
    }

    if (req.cookies.get(PARTNER_COOKIE)?.value) {
      // Custom matches is the one operator screen a sub-admin may open.
      // Every other /admin path, including the logo and a double tap, belongs
      // on their own dashboard.
      if (pathname === "/admin" || pathname.startsWith("/admin/custom-matches")) return NextResponse.next();
      const url = req.nextUrl.clone();
      url.pathname = "/partner";
      url.search = "";
      return NextResponse.redirect(url);
    }

    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Proxy always runs on the Node.js runtime, so the node:crypto token compare
// in lib/auth works here with no runtime declaration.
export const config = {
  matcher: ["/admin/:path*"],
};
