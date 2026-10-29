"use client";
import { Command, FolderPlus, LayoutGrid, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { ProjectCardDTO } from "@/lib/types";
import { CommandPalette } from "./command-palette";
import { DeadlineCountdown } from "./deadline-countdown";
import { PROJECT_NAV } from "./nav";

export interface ShellUser {
  name: string | null;
  email: string;
  bypass: boolean;
}

const initials = (text: string) =>
  text
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function AppShell({ user, projects, defaultOpen, children }: { user: ShellUser; projects: ProjectCardDTO[]; defaultOpen: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const match = /^\/projects\/([0-9a-f-]{36})(\/[^?]*)?/.exec(pathname);
  const projectId = match?.[1] ?? null;
  const subpath = match?.[2] ?? "";
  const current = projects.find((p) => p.id === projectId) ?? null;
  const currentNav = PROJECT_NAV.flatMap((g) => g.items).find((item) => (item.path === "" ? subpath === "" : subpath.startsWith(item.path)));

  // The DemoGuard cue window runs bare on a second monitor.
  if (subpath.startsWith("/demoguard/cue")) return <>{children}</>;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Stage Ready">
                <Link href="/projects">
                  <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <Sparkles size={16} strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="grid leading-tight">
                    <span className="font-semibold">Stage Ready</span>
                    <span className="text-muted-foreground text-xs">Rehearsal workspace</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {projectId ? (
            PROJECT_NAV.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map(({ label, path, icon: Icon }) => (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton asChild tooltip={label} isActive={currentNav?.label === label}>
                        <Link href={`/projects/${projectId}${path}`}>
                          <Icon size={20} strokeWidth={1.75} aria-hidden />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))
          ) : (
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Projects" isActive={pathname === "/projects"}>
                    <Link href="/projects">
                      <LayoutGrid size={20} strokeWidth={1.75} aria-hidden />
                      <span>Projects</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Create project" isActive={pathname === "/projects/new"}>
                    <Link href="/projects/new">
                      <FolderPlus size={20} strokeWidth={1.75} aria-hidden />
                      <span>Create project</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip={user.name ?? user.email} asChild>
                <a href={user.bypass ? "#" : "/api/auth/signout"} aria-label={user.bypass ? "Local developer (dev auth bypass)" : "Sign out"}>
                  <span className="bg-persona-2/15 text-foreground ring-persona-2 ring-1 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                    {initials(user.name ?? user.email)}
                  </span>
                  <span className="grid min-w-0 leading-tight">
                    <span className="truncate font-medium">{user.name ?? user.email}</span>
                    <span className="text-muted-foreground truncate text-xs">{user.bypass ? "Dev auth bypass" : "Sign out"}</span>
                  </span>
                  {user.bypass ? null : <LogOut className="ml-auto" size={16} aria-hidden />}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="bg-background/95 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-4!" />
          {projects.length > 0 ? (
            <Select value={projectId ?? ""} onValueChange={(id) => router.push(`/projects/${id}`)}>
              <SelectTrigger size="sm" className="max-w-48" aria-label="Switch project">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Breadcrumb className="hidden md:block">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/projects">Projects</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {current ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {currentNav && currentNav.path !== "" ? (
                      <BreadcrumbLink asChild>
                        <Link href={`/projects/${current.id}`}>{current.name}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{current.name}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {currentNav && currentNav.path !== "" ? (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{currentNav.label}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  ) : null}
                </>
              ) : pathname === "/projects/new" ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>New project</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : null}
            </BreadcrumbList>
          </Breadcrumb>
          {current?.demoMode ? <Badge variant="outline">Demo Mode</Badge> : null}
          <div className="ml-auto flex items-center gap-2">
            {current ? <DeadlineCountdown deadlineIso={current.deadlineIso} timezone={current.timezone} className="text-muted-foreground hidden text-xs lg:inline-flex" /> : null}
            <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => setPaletteOpen(true)} aria-label="Open command palette (Cmd+K)">
              <Command size={16} strokeWidth={1.75} aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="bg-muted hidden rounded px-1.5 font-mono text-[11px] sm:inline">⌘K</kbd>
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
      </SidebarInset>
      <CommandPalette projectId={projectId} projects={projects} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SidebarProvider>
  );
}
