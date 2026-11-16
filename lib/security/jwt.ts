export interface JwtPayload {
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  [key: string]: unknown;
}

export type JwtVerificationStatus =
  | "verified"
  | "unverified_no_secret"
  | "expired"
  | "malformed"
  | "invalid_signature"
  | "unsupported_alg";

export interface JwtVerificationResult {
  valid: boolean;
  status: JwtVerificationStatus;
  payload?: JwtPayload;
}

const HMAC_ALGS: Record<string, "SHA-256" | "SHA-384" | "SHA-512"> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

function decodeBase64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const bytes = decodeBase64UrlToBytes(segment);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/**
 * Parses a JWT and validates structure, `alg`, `exp`, `nbf`, and—when an HMAC `secret`
 * is provided—its cryptographic HMAC signature via Web Crypto (`crypto.subtle`).
 */
export async function verifyJwtToken(
  token: string | undefined | null,
  secret?: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<JwtVerificationResult> {
  if (!token || typeof token !== "string") {
    return { valid: false, status: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    return { valid: false, status: "malformed" };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; typ?: string }>(encodedHeader);
  const payload = decodeBase64UrlJson<JwtPayload>(encodedPayload);

  if (!header || !payload || typeof header.alg !== "string") {
    return { valid: false, status: "malformed" };
  }

  // Always reject unsigned tokens
  if (header.alg.toLowerCase() === "none") {
    return { valid: false, status: "unsupported_alg" };
  }

  // Reject expired or not-yet-valid tokens (30s clock skew allowance)
  const CLOCK_SKEW_SEC = 30;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return { valid: false, status: "malformed" };
  }
  if (payload.exp + CLOCK_SKEW_SEC <= nowSeconds) {
    return { valid: false, status: "expired", payload };
  }
  if (
    typeof payload.nbf === "number" &&
    Number.isFinite(payload.nbf) &&
    payload.nbf - CLOCK_SKEW_SEC > nowSeconds
  ) {
    return { valid: false, status: "malformed", payload };
  }

  const trimmedSecret = secret?.trim();
  if (!trimmedSecret) {
    return { valid: true, status: "unverified_no_secret", payload };
  }

  const hashAlg = HMAC_ALGS[header.alg];
  if (!hashAlg) {
    return { valid: false, status: "unsupported_alg", payload };
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(trimmedSecret),
      { name: "HMAC", hash: hashAlg },
      false,
      ["verify"]
    );
    const sigBytes = decodeBase64UrlToBytes(encodedSignature);
    const signingInput = encoder.encode(`${encodedHeader}.${encodedPayload}`);
    const sigOk = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes.buffer as ArrayBuffer,
      signingInput
    );

    if (!sigOk) {
      return { valid: false, status: "invalid_signature" };
    }

    return { valid: true, status: "verified", payload };
  } catch {
    return { valid: false, status: "invalid_signature" };
  }
}
