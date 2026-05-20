/**
 * AUTH STORE
 * Global authentication state.
 * Persisted to cookies (token) + memory (user object).
 */

import { create } from "zustand";
import { AuthUser } from "@/lib/types";
import Cookies from "js-cookie";

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
    Cookies.remove("villeto_auth_token");
    Cookies.remove("villeto_onboarding_session");
    Cookies.remove("villeto_approval_status");
    if (typeof window !== "undefined") {
      localStorage.removeItem("villeto_active_org_id");
      localStorage.removeItem("villeto-onboarding");
      sessionStorage.removeItem("villeto-onboarding");
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (loading) => set({ isLoading: loading }),
}));
