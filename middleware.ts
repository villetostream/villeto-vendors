import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

/**
 * EDGE MIDDLEWARE
 * Runs on every request before any page loads.
 *
 * Routing logic:
 * ─────────────────────────────────────────────────────────────
 * /invite?<raw_token>   (backend format: uuid.hex_signature)
 *   → Extracts raw token from query string
 *   → Normalises to /invite?token=<raw_token> via REDIRECT (reliable)
 *   → Also sets villeto_invite_token cookie as fallback
 *
 * /invite?token=<raw_token>  (already normalised)
 *   → Passes through to invite page (Server Component validates there)
 *
 * /onboarding/**
 *   → Must have valid auth_token cookie
 *   → Otherwise redirect /auth/login
 *
 * /(dashboard)/**
 *   → Must have valid auth_token cookie
 *   → Otherwise redirect /auth/login
 *
 * /auth/login
 *   → If already authenticated → redirect /dashboard
 * ─────────────────────────────────────────────────────────────
 *
 * WHY REDIRECT (not rewrite) for token normalisation:
 *   NextResponse.rewrite() is unreliable for passing modified searchParams
 *   to Next.js App Router Server Components — the RSC layer sometimes reads
 *   the original URL params rather than the rewritten URL params.
 *   A redirect (302) is a real HTTP round-trip, so the browser sends the
 *   normalised URL fresh and searchParams is always correct.
 */

const ONBOARDING_ROUTES = [
  "/onboarding/business-identity",
  "/onboarding/banking",
  "/onboarding/documents",
  "/onboarding/review",
];

const PROTECTED_ROUTES = [
  "/dashboard",
  "/orders",
  "/invoices",
  "/profile",
  "/pending",
];

/**
 * Extracts the invite token from an /invite request.
 *
 * Supports two URL formats produced by the backend:
 *   1. /invite?token=<value>            ← already normalised
 *   2. /invite?<uuid>.<hex_signature>   ← raw token as entire query string
 *
 * Returns null if no usable token is found.
 */
function extractInviteToken(request: NextRequest): string | null {
  // Format 1: standard ?token=xxx
  const tokenParam = request.nextUrl.searchParams.get("token");
  if (tokenParam) return tokenParam;

  // Format 2: raw query — the ENTIRE query string IS the token.
  // Browsers serialise a bare query key (no value) as "key=" (trailing "=").
  // So the backend link /invite?<uuid>.<hex> arrives as /invite?<uuid>.<hex>=
  // We must strip the trailing "=" before checking for real key=value pairs.
  const rawSearch = new URL(request.url).search; // includes leading "?"
  if (!rawSearch || rawSearch === "?") return null;

  // Strip the leading "?" then strip any trailing "=" that browsers append
  // when there is no value for a bare query key.
  const rawQuery = rawSearch.slice(1).replace(/=+$/, "");

  // The backend token format is <uuid>.<hex_signature>
  // e.g. a800efc3-bc01-4e69-aa0b-d495d5e3901c.39b03f5c049eb2e1...
  // After stripping the trailing "=", it must not contain "=" or "&".
  if (!rawQuery.includes("=") && !rawQuery.includes("&") && rawQuery.length > 10) {
    return rawQuery;
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Invite token gate ──────────────────────────────────────
  if (pathname === "/invite" || pathname === "/invite/") {
    const token = extractInviteToken(request);

    if (!token) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    // Already normalised → pass through to Server Component
    const alreadyNormalised = request.nextUrl.searchParams.get("token") === token;
    if (alreadyNormalised) {
      return NextResponse.next();
    }

    // Raw token detected → REDIRECT to normalised ?token=xxx form.
    // Real HTTP redirect ensures searchParams is always correct in the page.
    const normalised = new URL("/invite", request.url);
    normalised.searchParams.set("token", token);

    const redirectResponse = NextResponse.redirect(normalised, { status: 302 });

    // Belt-and-suspenders: also set cookie so the Server Component can read
    // the token via cookies() even if searchParams extraction somehow fails.
    redirectResponse.cookies.set("villeto_invite_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 30,
      path: "/",
    });

    return redirectResponse;
  }

  // ── 2. Already logged-in → skip login page ────────────────────
  if (pathname === "/auth/login") {
    const authToken = request.cookies.get(AUTH_COOKIE_NAMES.authToken)?.value;
    const vendorStatus = request.cookies.get(AUTH_COOKIE_NAMES.vendorStatus)?.value;

    if (authToken) {
      // Active (payment-enabled) → dashboard. Anything else → pending
      // (safety first — pending page itself explains why: under review,
      // rejected, or approved-but-payment-setup-in-progress).
      const destination = (vendorStatus ?? "").toLowerCase() === "active" ? "/dashboard" : "/pending";
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.next();
  }

  // ── 3. Onboarding routes — need auth token ─────
  const isOnboardingRoute = ONBOARDING_ROUTES.some((r) =>
    pathname.startsWith(r)
  );
  if (isOnboardingRoute) {
    const authToken = request.cookies.get(AUTH_COOKIE_NAMES.authToken)?.value;
    if (!authToken) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    return NextResponse.next();
  }

  // ── 4. Protected dashboard routes — need auth token ───────────
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (isProtected) {
    const authToken = request.cookies.get(AUTH_COOKIE_NAMES.authToken)?.value;
    if (!authToken) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Protection for dashboard routes — unapproved vendors should be at /pending
    const isDashboardRoute = pathname.startsWith("/dashboard") || 
                             pathname.startsWith("/orders") || 
                             pathname.startsWith("/invoices");
    
    if (isDashboardRoute && pathname !== "/pending") {
      // Gate on `status === "active"` (payment-enabled), NOT approvalStatus.
      // Approval means "documents verified"; active means "money can move".
      // A vendor can be approved and still correctly blocked here while
      // payment setup finishes — see villeto_vendor_status cookie, set
      // alongside approvalStatus in authStore/useAuth on every login,
      // switch-company, and pending-page poll.
      //
      // NOTE: backend has returned inconsistent casing for this field
      // ("Inactive" vs "active") — compared case-insensitively here since
      // Edge Middleware can't cheaply import the shared isStatusActive()
      // helper's full module graph. Keep this in sync with that helper.
      const vendorStatus = request.cookies.get(AUTH_COOKIE_NAMES.vendorStatus)?.value;
      const approvalStatus = request.cookies.get(AUTH_COOKIE_NAMES.approvalStatus)?.value;

      // Rejected vendors go to /pending to see the decision note, same as
      // not-yet-active vendors — but this is a distinct reason, not a
      // "wait" state, so /pending itself branches on approvalStatus too.
      if (approvalStatus === "rejected") {
        return NextResponse.redirect(new URL("/pending", request.url));
      }

      if ((vendorStatus ?? "").toLowerCase() !== "active") {
        return NextResponse.redirect(new URL("/pending", request.url));
      }
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
