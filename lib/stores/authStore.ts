/**
 * AUTH STORE
 * Global authentication state.
 * Persisted to cookies (token) + memory (user object).
 */

import { create } from "zustand";
import { AuthUser } from "@/lib/types";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES, ACTIVE_ORG_STORAGE_KEY } from "@/lib/constants/auth";

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  setUser: (user: AuthUser) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: true,
      isLoading: false,
    }),

  clearAuth: () => {
    Cookies.remove(AUTH_COOKIE_NAMES.authToken);
    Cookies.remove(AUTH_COOKIE_NAMES.onboardingSession);
    Cookies.remove(AUTH_COOKIE_NAMES.approvalStatus);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
      localStorage.removeItem("villeto-onboarding");
      sessionStorage.removeItem("villeto-onboarding");
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
