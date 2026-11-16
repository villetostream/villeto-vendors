import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy";

function toBase64Url(input: string | Uint8Array): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signTestJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
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

describe("Edge proxy route & token security controls", () => {
  const origSecret = process.env.JWT_SECRET;
  const secret = "proxy-test-jwt-secret-value-123456";

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });

  afterEach(() => {
    if (origSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = origSecret;
    }
  });

  it("redirects unauthenticated requests across all protected routes including /settings, /companies, and /notifications", async () => {
    const protectedPaths = [
      "/dashboard",
      "/orders",
      "/invoices",
      "/companies",
      "/settings",
      "/notifications",
      "/profile",
      "/pending",
      "/onboarding/comp-1",
    ];

    for (const path of protectedPaths) {
      const req = new NextRequest(`https://vendor.villeto.com${path}`);
      const res = await proxy(req);
      assert.equal(res.status, 307, `Expected redirect for unauthenticated ${path}`);
      const loc = new URL(res.headers.get("location")!);
      assert.equal(loc.pathname, "/auth/login");
    }
  });

  it("rejects forged or expired JWTs and clears stale auth cookies", async () => {
    const req = new NextRequest("https://vendor.villeto.com/dashboard", {
      headers: {
        cookie: "villeto_auth_token=forged.token.value; villeto_vendor_status=Active",
      },
    });
    const res = await proxy(req);
    assert.equal(res.status, 307);
    assert.equal(new URL(res.headers.get("location")!).pathname, "/auth/login");
    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /villeto_auth_token=;/);
  });

  it("enforces active vendor status gate for dashboard/orders/invoices and permits active signed tokens", async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const validJwt = await signTestJwt({ sub: "vendor-1", exp: futureExp }, secret);

    const inactiveReq = new NextRequest("https://vendor.villeto.com/dashboard", {
      headers: {
        cookie: `villeto_auth_token=${validJwt}; villeto_vendor_status=Inactive`,
      },
    });
    const inactiveRes = await proxy(inactiveReq);
    assert.equal(inactiveRes.status, 307);
    assert.equal(new URL(inactiveRes.headers.get("location")!).pathname, "/pending");

    const activeReq = new NextRequest("https://vendor.villeto.com/dashboard", {
      headers: {
        cookie: `villeto_auth_token=${validJwt}; villeto_vendor_status=Active`,
      },
    });
    const activeRes = await proxy(activeReq);
    assert.equal(activeRes.status, 200);
  });

  it("normalizes raw invite query tokens and sets HttpOnly SameSite=Lax cookie on /invite", async () => {
    const rawToken = "a800efc3-bc01-4e69-aa0b-d495d5e3901c.39b03f5c049eb2e1deadbeef";
    const req = new NextRequest(`https://vendor.villeto.com/invite?${rawToken}=`);
    const res = await proxy(req);
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get("location")!);
    assert.equal(location.pathname, "/invite");
    assert.equal(location.searchParams.get("token"), rawToken);

    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /villeto_invite_token=/);
    assert.match(setCookie, /HttpOnly/i);
  });
});
