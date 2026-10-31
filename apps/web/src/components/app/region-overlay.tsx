import type { UiRegion } from "@stage-ready/shared";
import { cn } from "@/lib/utils";

const REGION_STYLE: Record<UiRegion["label"], string> = {
  spinner: "border-status-unverified",
  progress_bar: "border-status-unverified",
  error_dialog: "border-status-contradicted",
  result_region: "border-status-verified",
};
const REGION_LABEL: Record<UiRegion["label"], string> = { spinner: "Spinner", progress_bar: "Progress", error_dialog: "Error", result_region: "Result" };

/** SAM 3.1's boxes over a screen preview (normalised 0–1 coordinates), each labelled with its concept. */
export function RegionOverlay({ regions }: { regions: UiRegion[] }) {
  return (
    <>
      {regions.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          data-region={r.label}
          className={cn("pointer-events-none absolute border-2", REGION_STYLE[r.label])}
          style={{ left: `${r.box[0] * 100}%`, top: `${r.box[1] * 100}%`, width: `${(r.box[2] - r.box[0]) * 100}%`, height: `${(r.box[3] - r.box[1]) * 100}%` }}
        >
          <span className="bg-background/90 absolute -top-5 left-0 rounded px-1 text-[11px]">
            {REGION_LABEL[r.label]} {Math.round(r.score * 100)}%
          </span>
        </div>
      ))}
    </>
  );
}

/** Which tracker watches the screen, in plain words. */
export const trackerLabel = (vision: string | null | undefined) => (vision === "sam" ? "SAM 3.1 tracking (Meta Model API)" : "Basic screen tracking (screen hashes and colour)");
