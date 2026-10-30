"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import type { QaKitDTO } from "@/lib/types";

export interface BackupSlide {
  id: string;
  question: string;
  title: string;
}

const preloaded = new Set<string>();

/** Backup slides for the Cmd+K finder. PNGs are fetched ahead of time so one shows instantly during live Q&A. */
export function useBackupSlides(projectId: string | null) {
  const { data } = useQuery({
    queryKey: ["qa-kit", projectId],
    queryFn: () => api<QaKitDTO>(`/api/projects/${projectId}/qa-kit`),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
  const slides: BackupSlide[] = (data?.questions ?? []).flatMap((q) => (q.slide?.hasPng ? [{ id: q.slide.id, question: q.text, title: q.slide.snapshot.title }] : []));
  useEffect(() => {
    for (const s of slides) {
      if (preloaded.has(s.id)) continue;
      preloaded.add(s.id);
      const img = new Image();
      img.decoding = "async";
      img.src = `/api/slides/${s.id}/png`;
    }
  }, [slides]);
  return slides;
}

/** Shows one backup slide full screen. Esc closes it. */
export function SlideViewer({ slide, onClose }: { slide: BackupSlide | null; onClose: () => void }) {
  return (
    <Dialog open={slide !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none items-center justify-center rounded-none border-0 bg-black p-0 sm:max-w-none">
        <DialogTitle className="sr-only">{slide?.title ?? "Backup slide"}</DialogTitle>
        <DialogDescription className="sr-only">Backup slide for: {slide?.question}</DialogDescription>
        {slide ? <img src={`/api/slides/${slide.id}/png`} alt={`Backup slide: ${slide.title}`} className="max-h-full max-w-full object-contain" width={1920} height={1080} /> : null}
      </DialogContent>
    </Dialog>
  );
}
