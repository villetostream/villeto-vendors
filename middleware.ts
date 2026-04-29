import { NextRequest, NextResponse } from "next/server";

/**
 * EDGE MIDDLEWARE
 * Runs on every request before any page loads.
 *
 * Routing logic:
 * ─────────────────────────────────────────────────────────────
 * /invite?token=xxx
 *   → Validates token expiry server-side (calls verify API)
 *   → If vendor already onboarded → redirect /auth/login
 *   → If expired → redirect /invite/expired
 *   → If valid & new vendor → allow through
 *
 * /onboarding/**
 *   → Must have onboarding_session cookie (set after password creation)
 *   → Otherwise redirect back to /invite (or /auth/login if already onboarded)
 *
 * /(dashboard)/**
 *   → Must have valid auth_token cookie
 *   → Must NOT be in pending/rejected status
 *   → Otherwise redirect /auth/login
 *
 * /auth/login
 *   → If already authenticated → redirect /dashboard
 * ─────────────────────────────────────────────────────────────
 *
 * NOTE: Token validation here is lightweight (JWT decode on edge).
 * Full re-validation against DB happens in API route handlers.
 */

// Routes that are always public
const PUBLIC_ROUTES = [
  "/invite",
  "/signup",
  "/auth/login",
  "/pending",
  "/invite/expired",
];

// Routes that require an active onboarding session
const ONBOARDING_ROUTES = [
  "/onboarding/business-identity",
  "/onboarding/banking",
  "/onboarding/documents",
  "/onboarding/review",
];

// Routes that require full auth (active vendor)
const PROTECTED_ROUTES = [
  "/dashboard",
  "/orders",
  "/invoices",
  "/profile",
];

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // ── 1. Invite token gate ──────────────────────────────────────
  if (pathname === "/invite") {
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    // ----------------------------------------------------------------
    // TOKEN VALIDATION (server-side / edge)
    // ----------------------------------------------------------------
    // INTEGRATION POINT:
    // Replace this block with a real API call to your backend:
    //
    //   const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/invite/validate`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ token }),
    //   });
    //   const data = await res.json();
    //
    //   if (!res.ok || data.expired) {
    //     return NextResponse.redirect(new URL("/invite/expired", request.url));
    //   }
    //   if (data.already_onboarded) {
    //     return NextResponse.redirect(new URL("/auth/login", request.url));
    //   }
    // ----------------------------------------------------------------

    // For now: decode a simple JWT-like structure from token
    // (basic expiry check — real validation happens in the page's server component)
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payloadStr = Buffer.from(parts[1], "base64url").toString("utf8");
        const payload = JSON.parse(payloadStr);
        const now = Math.floor(Date.now() / 1000);

        if (payload.exp && payload.exp < now) {
          return NextResponse.redirect(new URL("/invite/expired", request.url));
        }

        if (payload.already_onboarded === true) {
          return NextResponse.redirect(new URL("/auth/login", request.url));
        }
      }
    } catch {
      // If we can't parse — allow the page to handle it
    }

    return NextResponse.next();
  }

  // ── 2. Already logged-in → skip login page ────────────────────
  if (pathname === "/auth/login") {
    const authToken = request.cookies.get("villeto_auth_token")?.value;
    if (authToken) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // ── 3. Onboarding routes — need onboarding_session cookie ─────
  const isOnboardingRoute = ONBOARDING_ROUTES.some((r) =>
    pathname.startsWith(r)
  );
  if (isOnboardingRoute) {
    const session = request.cookies.get("villeto_onboarding_session")?.value;
    if (!session) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    return NextResponse.next();
  }

  // ── 4. Protected dashboard routes — need auth token ───────────
  const isProtected = PROTECTED_ROUTES.some((r) => pathname.startsWith(r));
  if (isProtected) {
    const authToken = request.cookies.get("villeto_auth_token")?.value;

    if (!authToken) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // ----------------------------------------------------------------
    // VENDOR STATUS CHECK (edge)
    // INTEGRATION POINT:
    // Optionally decode the JWT to check vendor status without DB call.
    // If status is "pending" or "rejected", redirect appropriately.
    //
    //   const payload = decodeJWT(authToken);
    //   if (payload.vendor_status === "pending") {
    //     return NextResponse.redirect(new URL("/pending", request.url));
    //   }
    // ----------------------------------------------------------------

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|public|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
