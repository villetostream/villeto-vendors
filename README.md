# Villeto Vendor Portal

> **Stack:** Next.js 15 · TypeScript · Tailwind v4 · TanStack Query v5 · Zustand v5 · React Hook Form + Zod · Axios · Radix UI · Sonner

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
villeto-vendor-app/
├── app/
│   ├── (auth)/
│   │   └── auth/login/          # Vendor sign-in
│   ├── (onboarding)/
│   │   ├── invite/              # Landing from invite link
│   │   ├── invite/expired/      # Expired token page
│   │   ├── signup/              # Password creation
│   │   ├── onboarding/
│   │   │   ├── business-identity/   # Step 1
│   │   │   ├── banking/             # Step 2 — account resolve
│   │   │   ├── documents/           # Step 3 — file upload
│   │   │   └── review/              # Step 4 — review & submit
│   │   └── pending/             # Post-submit waiting screen
│   ├── (dashboard)/
│   │   ├── dashboard/           # Stats + recent orders
│   │   ├── orders/              # Orders list
│   │   ├── orders/[id]/         # Order detail + delivery flow
│   │   ├── invoices/            # Invoices list + 3-dot actions
│   │   ├── invoices/create/     # Create / edit invoice
│   │   ├── invoices/[id]/       # Invoice detail + status workflow
│   │   └── profile/             # Vendor profile + connected orgs
│   ├── globals.css              # Design tokens + Tailwind v4
│   ├── layout.tsx               # Root layout + Providers
│   └── not-found.tsx
├── components/
│   ├── ui/                      # Button, Input, Select, Modal, Badge, Spinner
│   ├── shared/                  # VilletoLogo, Providers
│   ├── dashboard/               # Sidebar, TopBar (org switcher)
│   ├── onboarding/              # OnboardingStepper
│   ├── orders/                  # DeliveryModal, PartialDeliveryPanel
│   └── invoices/                # InvoiceActionMenu (3-dot popup)
├── lib/
│   ├── api/                     # All API functions (integration points marked)
│   │   ├── client.ts            # Axios instance + interceptors
│   │   ├── auth.ts
│   │   ├── onboarding.ts
│   │   ├── orders.ts
│   │   ├── invoices.ts
│   │   └── vendor.ts
│   ├── hooks/                   # TanStack Query hooks (useOrders, useInvoices, useOrg)
│   ├── stores/                  # Zustand stores (authStore, orgStore, onboardingStore)
│   ├── types/                   # Shared TypeScript interfaces
│   └── utils/                   # cn, formatCurrency, fuzzyMatchScore, etc.
└── middleware.ts                # Edge middleware — token/auth routing
```

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=https://api.villeto.app/v1
```

---

## Backend Integration Guide

Every API function is annotated with an `// INTEGRATION POINT ↓` comment.
Replace the function body with a real `apiClient.get/post/patch/delete` call.

### Auth flow
| Action | Endpoint |
|--------|----------|
| Validate invite token | `POST /auth/invite/validate` |
| Sign up (set password) | `POST /auth/signup` |
| Login | `POST /auth/login` |
| Logout | `POST /auth/logout` |
| Get current user | `GET /auth/me` |

### Onboarding
| Action | Endpoint |
|--------|----------|
| Magic lookup (reg no → biz name) | `GET /onboarding/lookup/business?reg_no=` |
| Bank list | `GET /onboarding/banking/banks?country=NG` |
| Account resolve | `POST /onboarding/banking/resolve` |
| Save step 1 | `POST /onboarding/business-identity` |
| Save step 2 | `POST /onboarding/banking` |
| Upload document | `POST /onboarding/documents/upload` (multipart) |
| Final submit | `POST /onboarding/submit` |

### Orders
| Action | Endpoint |
|--------|----------|
| List | `GET /orders` |
| Detail | `GET /orders/:id` |
| Acknowledge | `POST /orders/:id/acknowledge` |
| Ready for delivery | `POST /orders/:id/ready-for-delivery` |
| Full delivery | `POST /orders/:id/deliver` `{ type: "full" }` |
| Partial delivery | `POST /orders/:id/deliver` `{ type: "partial", items: [...] }` |
| Fulfill remaining | `POST /orders/:id/fulfill` |

### Invoices
| Action | Endpoint |
|--------|----------|
| List | `GET /invoices` |
| Detail | `GET /invoices/:id` |
| Create | `POST /invoices` |
| Update | `PATCH /invoices/:id` |
| Delete | `DELETE /invoices/:id` |
| Download PDF | `GET /invoices/:id/download` (blob) |

---

## Org Context Switching

The `useOrg()` hook handles all org switching logic with zero full-page reloads:

```ts
const { switchOrg } = useOrg();
switchOrg("org_id_123");
// → updates Zustand store
// → persists to localStorage + URL (?org=org_id_123)
// → cancels in-flight queries for old org
// → invalidates all org-scoped TanStack queries
// → queries refetch automatically with new org context
```

All query keys include `orgId` to prevent cross-org data leakage:
```ts
queryKeys.orders("org1", filters)  // ["orders", "org1", filters]
queryKeys.orders("org2", filters)  // ["orders", "org2", filters]  ← separate cache entry
```

---

## Name Match Logic (Onboarding)

**Step 1 — Business Identity:** As the vendor types their registration number (debounced 800ms), `magicLookupBusiness()` is called. The returned business name is fuzzy-matched against what the vendor typed. Score ≥ 70% = green check, < 70% = red warning.

**Step 2 — Banking:** When bank + 10-digit account number are entered, `resolveAccountName()` fires. The resolved account holder name is fuzzy-matched against the `businessIdentity.business_name`. Score ≥ 90% = PASS, < 90% = FLAGGED (amber banner + note required before continuing).

The `fuzzyMatchScore()` utility in `lib/utils/index.ts` uses Levenshtein distance with business suffix normalization (strips Ltd, Limited, PLC, etc.).
