"use client";
import { FolderPlus, Keyboard, LayoutGrid, Presentation } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PROJECT_NAV, SHORTCUTS } from "./nav";
import { SlideViewer, useBackupSlides, type BackupSlide } from "./qa-kit/slide-finder";

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function CommandPalette({
  projectId,
  projects,
  open,
  onOpenChange,
}: {
  projectId: string | null;
  projects: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [slide, setSlide] = useState<BackupSlide | null>(null);
  const slides = useBackupSlides(projectId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      } else if (event.key === "?" && !isTyping(event.target)) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <>
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <CommandInput placeholder="Type a command or search" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {slides.length ? (
            <CommandGroup heading="Backup slides">
              {slides.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`slide ${s.question} ${s.title} ${s.id}`}
                  onSelect={() => {
                    onOpenChange(false);
                    setSlide(s);
                  }}
                >
                  <Presentation strokeWidth={1.75} /> <span className="truncate">{s.question}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {projectId
            ? PROJECT_NAV.map((group) => (
                <CommandGroup key={group.label} heading={group.label}>
                  {group.items.map(({ label, path, icon: Icon }) => (
                    <CommandItem key={label} onSelect={() => go(`/projects/${projectId}${path}`)}>
                      <Icon strokeWidth={1.75} /> {label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            : null}
          <CommandGroup heading="Projects">
            <CommandItem onSelect={() => go("/projects")}>
              <LayoutGrid strokeWidth={1.75} /> All projects
            </CommandItem>
            <CommandItem onSelect={() => go("/projects/new")}>
              <FolderPlus strokeWidth={1.75} /> Create project
            </CommandItem>
            {projects.map((p) => (
              <CommandItem key={p.id} value={`open ${p.name} ${p.id}`} onSelect={() => go(`/projects/${p.id}`)}>
                <LayoutGrid strokeWidth={1.75} /> Open {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Help">
            <CommandItem
              onSelect={() => {
                onOpenChange(false);
                setShortcutsOpen(true);
              }}
            >
              <Keyboard strokeWidth={1.75} /> Show all shortcuts <CommandShortcut>?</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <SlideViewer slide={slide} onClose={() => setSlide(null)} />
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Every action is reachable from the keyboard.</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-2">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={keys} className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{action}</dt>
                <dd>
                  <Badge variant="outline" className="font-mono">
                    {keys}
                  </Badge>
                </dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
