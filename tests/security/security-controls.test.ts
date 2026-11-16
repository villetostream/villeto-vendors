import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { sanitizeRedirectPath } from "../../lib/security/redirect";
import { sanitizeSafeUrl, resolveSafeApiAssetUrl, encodePathSegment } from "../../lib/security/urls";
import { detectMagicKind, validateUploadMetadata, validateUploadFile } from "../../lib/security/upload";
import { verifyJwtToken } from "../../lib/security/jwt";
import {
  signupSchema,
  bankingSchema,
  createInvoiceSchema,
  invoiceLineItemSchema,
} from "../../lib/validations/index";

function toBase64Url(input: string | Uint8Array): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signHs256Jwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  return `${header}.${body}.${toBase64Url(new Uint8Array(sig))}`;
}

describe("sanitizeRedirectPath (open-redirect defense)", () => {
  it("allows safe internal relative paths with query strings", () => {
    assert.equal(sanitizeRedirectPath("/dashboard"), "/dashboard");
    assert.equal(sanitizeRedirectPath("/orders/po-123?tab=items"), "/orders/po-123?tab=items");
    assert.equal(sanitizeRedirectPath("/settings#banking"), "/settings#banking");
  });

  it("rejects external, protocol-relative, backslash, encoded-slash, control-char, and script URLs", () => {
    const malicious = [
      "https://evil.example/phish",
      "http://evil.example",
      "//evil.example/login",
      "/\\evil.example",
      "\\/evil.example",
      "/%2fevil.example",
      "/%5cevil.example",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "/dashboard\r\nSet-Cookie: a=b",
      "/auth/login",
      "/auth/reset-password?email=a@b.com",
      "",
      null,
      undefined,
    ];
    for (const target of malicious) {
      assert.equal(sanitizeRedirectPath(target, "/dashboard"), "/dashboard");
    }
  });
});

describe("sanitizeSafeUrl & encodePathSegment (XSS URL & path traversal defense)", () => {
  it("allows https/http URLs and blocks active URI schemes", () => {
    assert.equal(sanitizeSafeUrl("https://cdn.example.com/file.pdf"), "https://cdn.example.com/file.pdf");
    assert.equal(sanitizeSafeUrl("javascript:alert(1)"), undefined);
    assert.equal(sanitizeSafeUrl("  JaVaScRiPt:alert(1)"), undefined);
    assert.equal(sanitizeSafeUrl("data:text/html,<script>alert(1)</script>"), undefined);
    assert.equal(sanitizeSafeUrl("vbscript:msgbox(1)"), undefined);
    assert.equal(sanitizeSafeUrl("blob:https://vendor.villeto.com/123"), undefined);
    assert.equal(
      sanitizeSafeUrl("blob:https://vendor.villeto.com/123", { allowBlob: true }),
      "blob:https://vendor.villeto.com/123"
    );
  });

  it("resolves backend viewEndpoint safely without protocol-relative bypass", () => {
    assert.equal(
      resolveSafeApiAssetUrl(null, "/vendor-network/me/docs/1/view"),
      "https://api.villeto.com/vendor-network/me/docs/1/view"
    );
    assert.equal(resolveSafeApiAssetUrl(null, "//evil.example/leak"), undefined);
    assert.equal(resolveSafeApiAssetUrl("javascript:alert(1)", null), undefined);
  });

  it("encodes path parameters and rejects traversal identifiers", () => {
    assert.equal(encodePathSegment("po-123/../../admin"), "po-123%2F..%2F..%2Fadmin");
    assert.throws(() => encodePathSegment(".."));
    assert.throws(() => encodePathSegment("."));
    assert.throws(() => encodePathSegment("   "));
  });
});

describe("File upload validation (MIME, extension, size, magic-byte inspection)", () => {
  it("detects valid PDF, JPEG, PNG, and WebP magic headers and rejects SVG/HTML polyglots", () => {
    assert.equal(detectMagicKind(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])), "pdf");
    assert.equal(detectMagicKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
    assert.equal(
      detectMagicKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      "png"
    );
    assert.equal(
      detectMagicKind(Buffer.from("RIFF1234WEBP")),
      "webp"
    );
    assert.equal(detectMagicKind(Buffer.from("<svg onload=alert(1)>")), null);
    assert.equal(detectMagicKind(Buffer.from("<!DOCTYPE html><script>alert(1)</script>")), null);
  });

  it("rejects executable or mismatched MIME/extension files via validateUploadFile", async () => {
    const spoofedPng = new File([Buffer.from("<svg onload=alert(1)>")], "shell.png", {
      type: "image/png",
    });
    const spoofRes = await validateUploadFile(spoofedPng, "evidenceImage");
    assert.equal(spoofRes.valid, false);

    const realPdfWithWrongExt = new File([Buffer.from("%PDF-1.7\n...")], "doc.png", {
      type: "image/png",
    });
    const mismatchRes = await validateUploadFile(realPdfWithWrongExt, "document");
    assert.equal(mismatchRes.valid, false);

    const validPdf = new File([Buffer.from("%PDF-1.7\nhello")], "certificate.pdf", {
      type: "application/pdf",
    });
    const okRes = await validateUploadFile(validPdf, "document");
    assert.equal(okRes.valid, true);
    assert.equal(okRes.detectedKind, "pdf");
  });

  it("rejects empty and oversized files synchronously", () => {
    const empty = validateUploadMetadata({ name: "a.pdf", size: 0, type: "application/pdf" }, "document");
    assert.equal(empty.valid, false);

    const tooBig = validateUploadMetadata(
      { name: "a.jpg", size: 6 * 1024 * 1024, type: "image/jpeg" },
      "evidenceImage"
    );
    assert.equal(tooBig.valid, false);
  });
});

describe("JWT Edge verification (verifyJwtToken)", () => {
  const secret = "test-edge-secret-32-chars-minimum-ok";
  const now = 1_800_000_000;

  it("verifies a valid HS256 JWT with valid signature and future exp", async () => {
    const token = await signHs256Jwt({ sub: "vendor-1", exp: now + 600 }, secret);
    const res = await verifyJwtToken(token, secret, now);
    assert.equal(res.valid, true);
    assert.equal(res.status, "verified");
  });

  it("rejects forged, wrong-secret, expired, unsigned (alg=none), and malformed tokens", async () => {
    const validToken = await signHs256Jwt({ sub: "vendor-1", exp: now + 600 }, secret);
    const badSecretRes = await verifyJwtToken(validToken, "wrong-secret", now);
    assert.equal(badSecretRes.valid, false);
    assert.equal(badSecretRes.status, "invalid_signature");

    const expiredToken = await signHs256Jwt({ sub: "vendor-1", exp: now - 120 }, secret);
    const expiredRes = await verifyJwtToken(expiredToken, secret, now);
    assert.equal(expiredRes.valid, false);
    assert.equal(expiredRes.status, "expired");

    const algNoneToken = `${toBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${toBase64Url(
      JSON.stringify({ sub: "admin", exp: now + 600 })
    )}.sig`;
    const algNoneRes = await verifyJwtToken(algNoneToken, secret, now);
    assert.equal(algNoneRes.valid, false);
    assert.equal(algNoneRes.status, "unsupported_alg");

    const noExpToken = await signHs256Jwt({ sub: "vendor-1" }, secret);
    const noExpRes = await verifyJwtToken(noExpToken, secret, now);
    assert.equal(noExpRes.valid, false);
    assert.equal(noExpRes.status, "malformed");

    const malformed = await verifyJwtToken("not-a-jwt", secret, now);
    assert.equal(malformed.valid, false);
  });
});

describe("Input validation bounds (Zod schemas)", () => {
  it("enforces bounded lengths, finite numbers, and 10-digit bank accounts", () => {
    assert.equal(
      bankingSchema.safeParse({
        bank_code: "058",
        bank_name: "GTBank",
        account_number: "••••1234",
      }).success,
      false
    );
    assert.equal(
      bankingSchema.safeParse({
        bank_code: "058",
        bank_name: "GTBank",
        account_number: "0123456789",
      }).success,
      true
    );
    assert.equal(
      signupSchema.safeParse({
        password: "A1a" + "x".repeat(130),
        confirm_password: "A1a" + "x".repeat(130),
      }).success,
      false
    );
    assert.equal(
      invoiceLineItemSchema.safeParse({
        id: "1",
        name: "Widget",
        quantity: Number.POSITIVE_INFINITY,
        unit_price: 100,
      }).success,
      false
    );
    assert.equal(
      createInvoiceSchema.safeParse({
        delivery_date: "2026-11-01",
        items: Array.from({ length: 501 }, (_, idx) => ({
          id: `${idx}`,
          name: "Item",
          quantity: 1,
          unit_price: 10,
        })),
      }).success,
      false
    );
  });
});
