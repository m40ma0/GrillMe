"use client";
import type { JobStatus } from "@stage-ready/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

/** Polls a background job every 1.5 s until it completes or fails. */
export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api<JobStatus>(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => (query.state.data && ["completed", "failed"].includes(query.state.data.state) ? false : 1_500),
  });
}
