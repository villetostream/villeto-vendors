"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { useCompanyStore } from "@/lib/stores/companyStore";
import { PageSpinner } from "@/components/ui/Spinner";
import Cookies from "js-cookie";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

export default function OnboardingIndexPage() {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const authCompanies = useAuthStore((s) => s.companies);
  const storeCompanies = useCompanyStore((s) => s.companies);
  const activeCompanyId = useCompanyStore((s) => s.activeCompanyId);

  useEffect(() => {
    const cookieCompanyId = Cookies.get(AUTH_COOKIE_NAMES.activeCompanyId);
    const targetCompanyId =
      activeCompanyId ||
      cookieCompanyId ||
      authUser?.companyId ||
      authCompanies?.[0]?.companyId ||
      storeCompanies?.[0]?.companyId;

    if (targetCompanyId) {
      router.replace(`/onboarding/${targetCompanyId}`);
    } else {
      router.replace("/companies");
    }
  }, [activeCompanyId, authUser, authCompanies, storeCompanies, router]);

  return (
    <div className="flex flex-1 items-center justify-center w-full min-h-[50vh]">
      <PageSpinner />
    </div>
  );
}
