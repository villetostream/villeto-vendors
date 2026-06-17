import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAMES } from "@/lib/constants/auth";

export default async function RootPage() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get(AUTH_COOKIE_NAMES.authToken)?.value;
  const approvalStatus = cookieStore.get(AUTH_COOKIE_NAMES.approvalStatus)?.value;

  if (!authToken) {
    redirect("/auth/login");
  }

  if (approvalStatus && approvalStatus !== "approved") {
    redirect("/pending");
  }

  redirect("/dashboard");
}
