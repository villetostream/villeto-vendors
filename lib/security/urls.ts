const DEFAULT_API_BASE_URL = "https://api.villeto.com";
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Returns the normalized backend API base URL from `NEXT_PUBLIC_API_URL`,
 * falling back to the production API origin if unset or invalid.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!configured) {
    return DEFAULT_API_BASE_URL;
  }

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return DEFAULT_API_BASE_URL;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

export interface SafeUrlOptions {
  /** Allow `blob:` object URLs created locally via `URL.createObjectURL`. */
  allowBlob?: boolean;
  /** Allow single-slash app/API relative paths such as `/vendor-network/...`. */
  allowRelative?: boolean;
}

/**
 * Validates that a URL is safe for navigation (`<a href>`) or media rendering (`<img src>`),
 * blocking `javascript:`, `data:`, `vbscript:`, `file:`, and protocol-relative URLs.
 */
export function sanitizeSafeUrl(
  rawUrl: string | null | undefined,
  options: SafeUrlOptions = {}
): string | undefined {
  if (!rawUrl || typeof rawUrl !== "string") {
    return undefined;
  }

  const cleaned = rawUrl.replace(CONTROL_CHARS, "").trim();
  if (!cleaned) {
    return undefined;
  }

  if (options.allowRelative && cleaned.startsWith("/") && !cleaned.startsWith("//") && !cleaned.startsWith("/\\")) {
    return cleaned;
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
    if (options.allowBlob && parsed.protocol === "blob:") {
      return cleaned;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a backend document URL or viewEndpoint safely using the configured API origin.
 */
export function resolveSafeApiAssetUrl(
  fileUrl?: string | null,
  viewEndpoint?: string | null,
  options: { allowBlob?: boolean } = {}
): string | undefined {
  const direct = sanitizeSafeUrl(fileUrl, { allowBlob: options.allowBlob });
  if (direct) {
    return direct;
  }

  if (viewEndpoint && typeof viewEndpoint === "string") {
    const trimmed = viewEndpoint.trim();
    if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
      return sanitizeSafeUrl(`${getApiBaseUrl()}${trimmed}`);
    }
  }

  return undefined;
}

/**
 * Safely encodes a dynamic path segment for API requests and rejects empty values.
 */
export function encodePathSegment(value: string): string {
  const trimmed = value?.trim?.() ?? "";
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new Error("Invalid identifier path segment");
  }
  return encodeURIComponent(trimmed);
}
