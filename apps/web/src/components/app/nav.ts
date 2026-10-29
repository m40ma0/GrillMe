import { Activity, BookOpenCheck, Film, Gauge, LayoutDashboard, ListChecks, ShieldCheck, Video, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  /** Relative to /projects/[projectId]. */
  path: string;
  icon: LucideIcon;
}

export const PROJECT_NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Prepare",
    items: [
      { label: "Overview", path: "", icon: LayoutDashboard },
      { label: "Calibration", path: "/calibration", icon: Gauge },
      { label: "Q&A Kit", path: "/qa-kit", icon: BookOpenCheck },
      { label: "Progress", path: "/progress", icon: Activity },
    ],
  },
  {
    label: "Present",
    items: [
      { label: "Rehearsal Studio", path: "/rehearse", icon: Video },
      { label: "Sessions", path: "/sessions", icon: ListChecks },
      { label: "Director", path: "/director", icon: Film },
      { label: "DemoGuard", path: "/demoguard", icon: ShieldCheck },
    ],
  },
];

export const SHORTCUTS: [string, string][] = [
  ["⌘ K", "Command palette, including the backup slide finder"],
  ["⌘ B", "Collapse or expand the sidebar"],
  ["⌘ Enter", "Start or stop a rehearsal session"],
  ["⌘ .", "Ask the current judge to yield"],
  ["⇧ P", "DemoGuard Panic: switch to fallback now"],
  ["⇧ R", "DemoGuard Resume: back to live"],
  ["⇧ F", "DemoGuard Freeze"],
  ["J / K", "Previous or next take in Director"],
  ["?", "Show all shortcuts"],
];
