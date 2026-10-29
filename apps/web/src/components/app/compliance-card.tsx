import type { ComplianceItem } from "@stage-ready/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";

export function ComplianceCard({ items }: { items: ComplianceItem[] }) {
  const failing = items.filter((i) => i.status === "fail").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance checklist</CardTitle>
        <CardDescription>{failing === 0 ? "Nothing is failing. Unknown items need more project data." : `${failing} item${failing === 1 ? "" : "s"} failing.`}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">{item.label}</div>
                <p className="text-muted-foreground">{item.detail}</p>
              </div>
              <StatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
