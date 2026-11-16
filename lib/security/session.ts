import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

const CLIENT_STORAGE_KEYS = [
  "villeto-onboarding",
  "villeto-company-onboarding",
  "villeto-company",
  "villeto_active_org_id",
];

/**
 * Clears all vendor-portal authentication and onboarding cookies plus client storage
 * across both `localStorage` and `sessionStorage`.
 */
export function clearAllClientSessionState(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const cookieName of Object.values(AUTH_COOKIE_NAMES)) {
    Cookies.remove(cookieName, { path: "/" });
    Cookies.remove(cookieName);
  }

  for (const key of CLIENT_STORAGE_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage access restrictions
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage access restrictions
    }
  }
}
