import type { LucideIcon } from "lucide-react";

/** An icon, one sentence on what goes here, and one primary action. */
export function EmptyState({ icon: Icon, children, action }: { icon: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
      <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </div>
      <p className="text-muted-foreground max-w-sm">{children}</p>
      {action}
    </div>
  );
}
