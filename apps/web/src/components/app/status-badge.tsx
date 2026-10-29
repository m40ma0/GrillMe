import type { CheckResult, ClaimStatus } from "@stage-ready/shared";
import { CircleCheck, CircleDashed, CircleHelp, CircleX, EyeOff, Radio, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Status = ClaimStatus | CheckResult | "live" | "fallback";

// Never colour alone: every status pairs a colour with an icon and a word.
const STATUS: Record<Status, { variant: "verified" | "contradicted" | "unverified" | "not_shown" | "live" | "fallback"; label: string; icon: typeof CircleCheck }> = {
  verified: { variant: "verified", label: "Verified", icon: CircleCheck },
  contradicted: { variant: "contradicted", label: "Contradicted", icon: CircleX },
  unverified: { variant: "unverified", label: "Unverified", icon: CircleHelp },
  not_shown: { variant: "not_shown", label: "Not shown", icon: EyeOff },
  pass: { variant: "verified", label: "Pass", icon: CircleCheck },
  fail: { variant: "contradicted", label: "Fail", icon: CircleX },
  unknown: { variant: "unverified", label: "Unknown", icon: CircleDashed },
  live: { variant: "live", label: "Live", icon: Radio },
  fallback: { variant: "fallback", label: "Fallback", icon: ShieldAlert },
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <Badge variant={s.variant}>
      <Icon aria-hidden strokeWidth={1.75} />
      {label ?? s.label}
    </Badge>
  );
}
