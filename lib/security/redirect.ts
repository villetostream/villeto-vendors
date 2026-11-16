const AUTH_SELF_REDIRECT_PREFIXES = [
  "/auth/login",
  "/auth/forgot-password",
  "/auth/reset-password",
];

const CONTROL_OR_WHITESPACE = /[\u0000-\u001F\u007F]/;

/**
 * Validates and sanitizes a relative post-login/middleware redirect target.
 * Rejects external origins, protocol-relative URLs (`//`), backslash tricks (`/\`),
 * javascript/data URIs, encoded slash/backslash bypasses, and auth self-loops.
 */
export function sanitizeRedirectPath(
  rawTarget: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!rawTarget || typeof rawTarget !== "string") {
    return fallback;
  }

  const trimmed = rawTarget.trim();
  if (!trimmed || CONTROL_OR_WHITESPACE.test(trimmed)) {
    return fallback;
  }

  // Must start with a single forward slash (reject `//evil.com`, `/\evil.com`, `https://`, `javascript:`)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Reject any backslashes or encoded slash/backslash tricks anywhere before query/fragment
  const pathPart = trimmed.split(/[?#]/)[0] ?? "";
  if (
    trimmed.includes("\\") ||
    /%2f|%5c/i.test(pathPart)
  ) {
    return fallback;
  }

  try {
    const base = "https://villeto.internal";
    const parsed = new URL(trimmed, base);
    if (parsed.origin !== base) {
      return fallback;
    }

    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!normalized.startsWith("/") || normalized.startsWith("//")) {
      return fallback;
    }

    // Avoid open/infinite redirect back into auth routes
    if (
      AUTH_SELF_REDIRECT_PREFIXES.some(
        (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
      )
    ) {
      return fallback;
    }

    return normalized;
  } catch {
    return fallback;
  }
}
