import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";
import { verifyJwtToken } from "@/lib/security/jwt";
import { sanitizeRedirectPath } from "@/lib/security/redirect";

/**
 * EDGE PROXY (formerly Middleware)
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
  "/onboarding",
  "/invitation",
];

const PROTECTED_ROUTES = [
  "/dashboard",
  "/orders",
  "/invoices",
  "/companies",
  "/settings",
  "/notifications",
  "/profile",
  "/pending",
];

function clearAuthCookiesOnResponse(response: NextResponse): NextResponse {
  response.cookies.delete(AUTH_COOKIE_NAMES.authToken);
  response.cookies.delete(AUTH_COOKIE_NAMES.vendorStatus);
  response.cookies.delete(AUTH_COOKIE_NAMES.approvalStatus);
  response.cookies.delete(AUTH_COOKIE_NAMES.activeCompanyId);
  response.cookies.delete(AUTH_COOKIE_NAMES.decisionNote);
  return response;
}

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Invite token gate ──────────────────────────────────────
  if (pathname === "/invite" || pathname === "/invite/") {
    const token = extractInviteToken(request);

    if (!token) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    const inviteCookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 30,
      path: "/",
    };

    // Already normalised → pass through to Server Component while ensuring HttpOnly invite cookie exists
    const alreadyNormalised = request.nextUrl.searchParams.get("token") === token;
    if (alreadyNormalised) {
      const response = NextResponse.next();
      response.cookies.set("villeto_invite_token", token, inviteCookieOptions);
      return response;
    }

    // Raw token detected → REDIRECT to normalised ?token=xxx form.
    // Real HTTP redirect ensures searchParams is always correct in the page.
    const normalised = new URL("/invite", request.url);
    normalised.searchParams.set("token", token);

    const redirectResponse = NextResponse.redirect(normalised, { status: 302 });

    // Belt-and-suspenders: also set cookie so Server Components (/invite, /signup)
    // can read the token via cookies() without propagating it in subsequent URLs.
    redirectResponse.cookies.set("villeto_invite_token", token, inviteCookieOptions);

    return redirectResponse;
  }

  // ── 2. Already logged-in → skip login page ────────────────────
  if (pathname === "/auth/login") {
    const authToken = request.cookies.get(AUTH_COOKIE_NAMES.authToken)?.value;
    const vendorStatus = request.cookies.get(AUTH_COOKIE_NAMES.vendorStatus)?.value;
    const approvalStatus = request.cookies.get(AUTH_COOKIE_NAMES.approvalStatus)?.value;

    if (authToken) {
      const jwtResult = await verifyJwtToken(authToken, process.env.JWT_SECRET);
      if (!jwtResult.valid) {
        return clearAuthCookiesOnResponse(NextResponse.next());
      }

      // If they are navigating to login with an invitation token or company ID, we must
      // allow them to render the page to accept the invite via the client-side router.
      if (request.nextUrl.searchParams.has("invitationToken") || request.nextUrl.searchParams.has("companyId")) {
        return NextResponse.next();
      }

      // Active (payment-enabled) → dashboard.
      if ((vendorStatus ?? "").toLowerCase() === "active") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      // Vendor has submitted (approvalStatus is set) → /pending to show review state.
      // Vendor is still onboarding (approvalStatus not yet set) → onboarding wizard.
      const activeCompanyId = request.cookies.get(AUTH_COOKIE_NAMES.activeCompanyId)?.value;
      const safeCompanyId = activeCompanyId && /^[a-zA-Z0-9_-]+$/.test(activeCompanyId) ? activeCompanyId : "";
      const destination = approvalStatus 
        ? "/pending" 
        : safeCompanyId 
          ? `/onboarding/${safeCompanyId}`
          : "/companies";
      
      return NextResponse.redirect(new URL(destination, request.url));
    }
    return NextResponse.next();
  }

  // ── 3. Onboarding routes — need valid auth token ─────
  const isOnboardingRoute = ONBOARDING_ROUTES.some((r) =>
    pathname.startsWith(r)
  );
  if (isOnboardingRoute) {
    const authToken = request.cookies.get(AUTH_COOKIE_NAMES.authToken)?.value;
    if (!authToken) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    const jwtResult = await verifyJwtToken(authToken, process.env.JWT_SECRET);
    if (!jwtResult.valid) {
      return clearAuthCookiesOnResponse(NextResponse.redirect(new URL("/auth/login", request.url)));
    }
    return NextResponse.next();
  }

  // ── 4. Protected dashboard routes — need valid auth token ───────────
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (isProtected) {
    const authToken = request.cookies.get(AUTH_COOKIE_NAMES.authToken)?.value;
    if (!authToken) {
      const loginUrl = new URL("/auth/login", request.url);
      const safeNext = sanitizeRedirectPath(`${pathname}${request.nextUrl.search}`, "");
      if (safeNext) {
        loginUrl.searchParams.set("next", safeNext);
      }
      return NextResponse.redirect(loginUrl);
    }

    const jwtResult = await verifyJwtToken(authToken, process.env.JWT_SECRET);
    if (!jwtResult.valid) {
      const loginUrl = new URL("/auth/login", request.url);
      const safeNext = sanitizeRedirectPath(`${pathname}${request.nextUrl.search}`, "");
      if (safeNext) {
        loginUrl.searchParams.set("next", safeNext);
      }
      return clearAuthCookiesOnResponse(NextResponse.redirect(loginUrl));
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
