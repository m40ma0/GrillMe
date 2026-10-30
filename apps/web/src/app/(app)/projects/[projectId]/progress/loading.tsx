import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Streams at once while the progress data loads: header, the trend chart and the two side cards. */
export default function ProgressLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading progress">
      <PageHeader title="Progress" description="How each criterion and weak spot changed across rehearsals, and what to work on next." />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <div className="grid gap-4">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
