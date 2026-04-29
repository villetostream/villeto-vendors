import Link from "next/link";
import { VilletoLogo } from "@/components/shared/VilletoLogo";

export default function NotFound() {
  return (
    <div className="min-h-screen onboarding-bg flex flex-col items-center justify-center px-4">
      <VilletoLogo size="md" className="mb-8" />
      <h1 className="text-5xl font-bold text-foreground mb-2">404</h1>
      <p className="text-muted-foreground mb-6 text-center">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/dashboard"
        className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
