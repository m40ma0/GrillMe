import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentUser } from "@/lib/server/auth";
import { listProjects } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin?callbackUrl=/projects");
  const [projects, cookieStore] = await Promise.all([listProjects(user.id), cookies()]);
  return (
    <AppShell user={{ name: user.name, email: user.email, bypass: user.bypass, guest: user.guest }} projects={projects} defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      {children}
    </AppShell>
  );
}
