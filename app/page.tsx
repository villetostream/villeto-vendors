import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

export default async function RootPage() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get(AUTH_COOKIE_NAMES.authToken)?.value;
  const vendorStatus = cookieStore.get(AUTH_COOKIE_NAMES.vendorStatus)?.value;

  if (!authToken) {
    redirect("/auth/login");
  }

  // Gate on status === "active" (payment-enabled), not approvalStatus.
  // Backend casing is inconsistent ("Inactive" vs "active") — compared
  // case-insensitively, same as middleware.ts.
  if ((vendorStatus ?? "").toLowerCase() !== "active") {
    redirect("/pending");
  }

  redirect("/dashboard");
}
