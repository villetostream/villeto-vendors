# Full Application Security Audit & Hardening Report — `villeto-vendor`

**Target Application:** Villeto Vendor Portal (`villeto-vendor`, Next.js 16.2.10 -> 16.4.6, React 19.2.1, TypeScript 5)  
**Assessment Scope:** Full repository static review, architecture & trust-boundary analysis, STRIDE threat modeling, dependency audit, vulnerability remediation, security regression test suite, and build/lint/type-check verification.

---

## 1. Repository & Attack-Surface Inventory

### Architecture Summary
- **Web Framework:** Next.js App Router (`app/`), Edge Proxy (`proxy.ts`), client state via Zustand (`lib/stores/*`) and TanStack Query v5 (`@tanstack/react-query`).
- **API Integration:** Axios (`lib/api/client.ts`) and Server Component `fetch()` (`lib/api/invite-preview.ts`) communicating with an external backend API (`NEXT_PUBLIC_API_URL`, fallback `https://api.villeto.com`).
- **Repository Boundaries:** No Next.js API Route Handlers (`app/api/**`), no Server Actions (`"use server"`), and no direct database connections reside inside `villeto-vendor`.

### Entry Points & Surfaces Audited
1. **Authentication & Invite Entry Points:** `/invite`, `/invite/expired`, `/signup`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/invitation/[companyId]`.
2. **Edge Proxy & Route Gates:** `proxy.ts` handling `/invite`, `/auth/login`, `/onboarding/**`, `/invitation/**`, `/dashboard`, `/orders`, `/invoices`, `/companies`, `/settings`, `/notifications`, `/profile`, `/pending`.
3. **Onboarding & Compliance Workflows (V1 & V2):** Business identity, verification, banking details, payment terms, document upload/preview (`onboarding/documents/page.tsx`, `onboarding/[companyId]/documents/page.tsx`, `onboarding/[companyId]/page.tsx`).
4. **Operational Portal Routes:** Dashboard (`/dashboard`), Orders & Fulfillment/Receipt Exceptions (`/orders`, `/orders/[id]`, `DisputeBuyerResponseModal.tsx`, `ResolutionModal.tsx`, `EvidenceGallery.tsx`), Invoices (`/invoices`, `/invoices/create`, `/invoices/[id]`, `/invoices/[id]/edit`), Companies (`/companies`, `/companies/[companyId]`), Settings (`/settings`), Notifications (`/notifications`), Profile (`/profile`), In-App Messaging (`MessagingWidget.tsx`, `lib/stores/messagingStore.ts`).

---

## 2. Standards & Framework Mapping

Findings and controls were evaluated against:
- **OWASP Top 10:2025 & ASVS 5.0.0:** Authentication & Session Management, Access Control, Input Validation & Sanitization, File Handling, Security Misconfiguration, Software Supply Chain Failures.
- **OWASP API Security Top 10:** API1 (BOLA/IDOR backend boundary), API2 (Broken Authentication), API8 (Security Misconfiguration).
- **OWASP WSTG:** Client-side URL redirection, HTTP security headers, cookie attributes, file upload validation.
- **MITRE CWE Top 25:** CWE-79 (XSS), CWE-601 (Open Redirect), CWE-434 (Unrestricted Upload of File with Dangerous Type), CWE-287 / CWE-347 (Improper JWT Verification), CWE-862 (Missing Authorization), CWE-20 (Improper Input Validation), CWE-400 (Resource Exhaustion), CWE-1395 (Vulnerable Third-Party Components).
- **NIST SSDF & OWASP SAMM:** Automated regression tests, functional lint/type-check/build gates, dependency auditing, and separation of client UX guards from authoritative backend controls.

---

## 3. Confirmed Findings & Remediations Implemented in This Repository

| ID | Vulnerability / Weakness | Severity | Standards / CWE | Affected Files | Remediation Implemented |
|---|---|---|---|---|---|
| **VULN-01** | **Outdated Dependencies with Critical/High CVEs** (`next@16.2.10` image/RSC/middleware RCE & SSRF, `axios@^1.9.0` prototype pollution/ReDoS/SSRF, `zod@4.1.5` DoS) | Critical | OWASP A06 / CWE-1395 | `package.json`, `package-lock.json` | Upgraded `next` & `eslint-config-next` to `16.4.6`, `axios` to `^1.20.0`, `zod` to `^4.6.7`, and ran `npm audit fix`. Eliminated all Critical (1->0), High (9->0), and runtime vulnerabilities; only 7 moderate dev-only `minimatch` advisories inside `eslint-config-next` remain. |
| **VULN-02** | **Open Redirect on `next` Query Parameter** | High | WSTG-CLNT-04 / CWE-601 | `app/(auth)/auth/login/page.tsx`, `components/shared/Providers.tsx`, `proxy.ts` | Created `sanitizeRedirectPath()` (`lib/security/redirect.ts`) enforcing strict same-origin single-slash paths and rejecting `//`, `/\`, `%2f`/`%5c`, schemes (`https:`, `javascript:`, `data:`), control chars, and auth self-loops. Applied across login redirect targets, `Providers.tsx`, and `proxy.ts`. |
| **VULN-03** | **Edge Proxy Incomplete Route Coverage & Missing JWT Verification** | High | ASVS V2/V4 / CWE-862 / CWE-347 | `proxy.ts`, `lib/security/jwt.ts` | Added `/companies`, `/settings`, `/notifications` to `PROTECTED_ROUTES`. Implemented Edge-compatible Web Crypto `verifyJwtToken()` validating JWT structure, rejecting `alg: none` and expired `exp` / future `nbf`, and cryptographically verifying HMAC signatures when `JWT_SECRET` is configured; invalid/expired tokens redirect to `/auth/login` and clear stale auth cookies. |
| **VULN-04** | **Invitation Token & Vendor PII Exposed in `/signup` Query URL + Missing Cookie `Secure` Flag** | High | ASVS V3 / CWE-598 / CWE-614 | `proxy.ts`, `app/(onboarding)/invite/page.tsx`, `app/(onboarding)/signup/page.tsx`, `app/(onboarding)/signup/SignupClient.tsx`, `lib/api/invite-preview.ts` | Added `secure: process.env.NODE_ENV === "production"` to `villeto_invite_token` and ensured it is set on all valid `/invite` requests. Converted `/signup` to a Server Component reading the `HttpOnly` cookie and passing invite context via RSC props; `/invite` CTA now links cleanly to `/signup` without exposing `?token=`/`&email=` in URLs; legacy query params are scrubbed with `window.history.replaceState`. Shared timeout-bounded `validateInviteTokenPreview()` (`AbortSignal.timeout(10_000)`). |
| **VULN-05** | **Weak or Missing File Upload Validation (MIME/Extension Spoofing, `.doc` iframe, `blob:` URL leaks)** | High | ASVS V12 / CWE-434 | `lib/security/upload.ts`, `app/(onboarding)/onboarding/documents/page.tsx`, `app/(onboarding)/onboarding/[companyId]/documents/page.tsx`, `app/(dashboard)/settings/page.tsx`, `components/orders/DisputeBuyerResponseModal.tsx`, `components/orders/ResolutionModal.tsx` | Created centralized `validateUploadFile()` checking non-empty size, upper size bounds, strict extension+MIME match, active markup (`<svg>`, `<html>`, `<script>`) rejection, and binary magic-byte signatures (PDF, JPEG, PNG, WebP, DOC, DOCX). Added validation to Settings and Dispute uploaders where type checks were absent, prevented `.doc`/`.docx` preview rendering inside `<iframe>`, and revoked `blob:` object URLs on dismiss/completion. |
| **VULN-06** | **Unsanitized External/Asset URLs & Hardcoded Fallback API Origin** | Medium-High | ASVS V5 / CWE-79 | `lib/security/urls.ts`, `components/orders/EvidenceGallery.tsx`, `app/(dashboard)/settings/page.tsx`, `app/(onboarding)/onboarding/[companyId]/documents/page.tsx`, `app/(onboarding)/onboarding/[companyId]/page.tsx`, `lib/api/client.ts` | Added `sanitizeSafeUrl()`, `resolveSafeApiAssetUrl()`, and `getApiBaseUrl()`. Blocked `javascript:`, `data:text/html`, `vbscript:`, and `//` URLs before rendering in `<a href>` / `<img>` across `EvidenceGallery` and Settings. Replaced hardcoded `https://api.villeto.com` strings with `getApiBaseUrl()`. |
| **VULN-07** | **Missing Web-Tier Security Headers (CSP, HSTS, `X-Powered-By`)** | Medium-High | ASVS V14 / CWE-693 | `next.config.ts` | Disabled `poweredByHeader`, added production `Strict-Transport-Security`, `X-DNS-Prefetch-Control: off`, and `Content-Security-Policy` (`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `frame-src 'self' blob:`, scoped `connect-src`, HTTPS `upgrade-insecure-requests`). |
| **VULN-08** | **Unencoded Path & Query Parameters in API Clients** | Medium | CWE-20 / CWE-88 | `lib/api/orders.ts`, `lib/api/invoices.ts`, `lib/api/vendor-network.ts`, `lib/api/messaging.ts`, `lib/api/notifications.ts`, `lib/api/onboarding.ts`, `lib/security/urls.ts` | Applied `encodeURIComponent()` to all dynamic path and query parameters across API modules and added `encodePathSegment()`. |
| **VULN-09** | **Incomplete/Duplicated Session Cleanup, Masked Bank Account Overwrite Risk & Unbounded Zod Schemas** | Medium | ASVS V3 / CWE-613 / CWE-20 | `lib/security/session.ts`, `lib/api/client.ts`, `lib/api/auth.ts`, `lib/stores/authStore.ts`, `app/(dashboard)/settings/page.tsx`, `lib/validations/index.ts` | Consolidated duplicate interceptor & session-clearing logic into `attachAuthInterceptors()` and `clearAllClientSessionState()`. Prevented submitting masked `"••••1234"` bank strings in Settings (`handleSaveBank()`). Added `.max(...)` and `.finite()` bounds across `lib/validations/index.ts`. |
| **VULN-10** | **Broken Lint Pipeline & Absent Security Regression Suite** | Medium | NIST SSDF / SAMM | `package.json`, `eslint.config.mjs`, `tests/security/*` | Fixed broken `next lint` script and `FlatCompat` ESLint 9 circular JSON crash by switching `eslint.config.mjs` to native `eslint-config-next/core-web-vitals` & `eslint-config-next/typescript` flat config (`"lint": "eslint ."`). Added automated Node `--test` security regression tests (`npm run test:security`). |

---

## 4. Required Backend & Infrastructure Remediations (Outside Frontend Repository)

Because `villeto-vendor` delegates authentication, multi-tenant authorization, database queries, and file storage to external backend APIs and hosting infrastructure, the following controls **cannot be enforced solely by this repository** and must be verified/implemented on the backend & infrastructure side:

1. **Migrate Auth Tokens from JS-Readable Cookies to `HttpOnly` Cookies (with BFF or SameSite/CSRF Defense):**
   - Currently the frontend reads `villeto_auth_token` via `js-cookie` to populate `Authorization: Bearer`. Migrate login/switch-company/refresh endpoints to set `HttpOnly; Secure; SameSite=Lax` (or `Strict`) cookies, enforce CSRF tokens / `Origin` checks on state-changing requests, and remove token visibility from client JavaScript.
2. **Authoritative Server-Side RBAC, Tenant Scoping, and Status Gating:**
   - Do not trust client-editable cookies (`villeto_vendor_status`, `villeto_approval_status`, `villeto_active_company_id`). Every backend endpoint must derive `vendorId` and `companyId` strictly from the verified JWT/session, verify vendor ownership on every PO/invoice/document/dispute ID (IDOR prevention), and reject dashboard operations unless the vendor-company relationship is `active`.
3. **Edge JWT Verification Configuration (`JWT_SECRET` or Asymmetric JWKS):**
   - Configure `JWT_SECRET` in the Next.js Edge environment if using HS256/HS512, or update `lib/security/jwt.ts` to verify against the identity service's public JWKS (`RS256`/`ES256`) if asymmetric signing is used.
4. **Server-Side File Upload Security & Private Object Storage:**
   - Re-validate file magic bytes server-side, strip metadata/EXIF, scan uploads with antivirus/malware engines, store files in private S3/GCS buckets served via short-lived signed URLs, and enforce `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` (never serving user-uploaded HTML/SVG inline on an app origin).
5. **Rate Limiting, CORS, Audit Logging & Invite Hygiene:**
   - Enforce strict IP/account rate limiting on `/vendors/auth/login`, `/vendors/auth/forgot-password`, `/vendors/auth/reset-password`, and `/vendors/invitations/preview`; lock CORS `Access-Control-Allow-Origin` strictly to `NEXT_PUBLIC_APP_URL`; emit immutable backend audit logs for auth, company switching, bank updates, invoice submission, and exception resolution.
6. **CSP Nonce Upgrade Path:**
   - Currently `next.config.ts` includes `'unsafe-inline'` in `script-src` because static prerendered App Router pages contain inline hydration scripts. If strict nonce-based CSP is required, convert remaining static pages to dynamic rendering and inject per-request CSP nonces inside `proxy.ts`.


---

## 5. Verification & Build Results

- **Production Build (`npm run build` / Next.js `16.4.6` Turbopack):** Exited with code `0`; compiled cleanly, TypeScript passed, all static and dynamic routes (`/invite`, `/signup`, `/companies/[companyId]`, `/orders/[id]`, `/invoices/[id]`, `/onboarding/[companyId]/*`) built cleanly.
- **Type Check (`npm run type-check` / `tsc --noEmit`):** Exited with code `0`.
- **Security Regression Tests (`npm run test:security`):** `15` passed, `0` failed across `6` suites (`tests/security/proxy.test.ts` and `tests/security/security-controls.test.ts`).
- **Targeted ESLint (`npx eslint` on new/security-hardened modules):** Exited with code `0` (`0` errors, `0` warnings). Note: full-repo `npm run lint` (`eslint .`) now runs under ESLint 9 without crashing and reports `291` pre-existing problems (`34` errors, `257` warnings) in untouched application files.
- **Dependency Audit (`npm audit`):**
  - **Production runtime (`npm audit --omit=dev --json`):** `0` vulnerabilities (`0` critical, `0` high, `0` moderate, `0` low across `145` prod / `547` total deps).
  - **Full tree including devDependencies:** `7` moderate dev-only `minimatch` advisories nested inside `@typescript-eslint/typescript-estree` (`eslint-config-next`); reduced from baseline `17` (`1` critical, `9` high, `7` moderate).
