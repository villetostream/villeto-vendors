import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateInviteTokenPreview } from "@/lib/api/invite-preview";
import { SignupClient, type SignupInviteContext } from "./SignupClient";

interface SignupPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const resolvedParams = await searchParams;
  const cookieStore = await cookies();

  const cookieToken = cookieStore.get("villeto_invite_token")?.value;
  const queryToken = typeof resolvedParams.token === "string" ? resolvedParams.token : undefined;
  const token = cookieToken || queryToken;

  if (!token) {
    redirect("/auth/login");
  }

  let initialInvite: SignupInviteContext | null = null;
  const preview = await validateInviteTokenPreview(token);
  if (preview.ok) {
    initialInvite = {
      token,
      email: preview.data.email,
      displayName: preview.data.displayName,
      legalName: preview.data.legalName,
      vendorId: preview.data.vendorId,
      vendorInvitationId: preview.data.vendorInvitationId,
    };
  } else if (preview.reason === "invalid") {
    redirect(preview.consumed ? "/invite/expired?reason=consumed" : "/invite/expired");
  }

  return <SignupClient initialInvite={initialInvite} />;
}
