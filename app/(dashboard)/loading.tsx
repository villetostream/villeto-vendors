import { Spinner } from "@/components/ui/Spinner";

/**
 * Next.js automatically wraps this route segment in a Suspense boundary
 * and shows this file while the segment is loading.
 */
export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
