import { Spinner } from "@/components/ui/Spinner";

export default function OnboardingLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
