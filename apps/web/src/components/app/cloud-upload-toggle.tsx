"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

/** Recordings stay local by default; cloud upload is opt-in per project. */
export function CloudUploadToggle({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(enabled);
  return (
    <div className="flex items-start gap-3">
      <Switch
        id="cloud-upload"
        checked={value}
        onCheckedChange={async (next) => {
          setValue(next);
          try {
            await api(`/api/projects/${projectId}`, { method: "PATCH", json: { cloudUploadEnabled: next } });
            router.refresh();
          } catch (error) {
            setValue(!next);
            toast.error((error as Error).message);
          }
        }}
      />
      <div className="grid gap-1">
        <Label htmlFor="cloud-upload">Upload recordings to cloud storage</Label>
        <p className="text-muted-foreground text-xs">{value ? "Recordings upload to this project's storage when a rehearsal ends." : "Off: recordings stay on this computer."}</p>
      </div>
    </div>
  );
}
