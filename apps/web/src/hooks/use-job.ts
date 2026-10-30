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

/**
 * The project's latest job of one kind (running, queued, or finished in the last hour), so a panel can
 * pick its progress back up after a reload or a failed start request.
 */
export function useLatestJob(projectId: string, name: string, enabled = true) {
  return useQuery({
    queryKey: ["latest-job", projectId, name],
    queryFn: () => api<{ job: { id: string; state: string } | null }>(`/api/projects/${projectId}/jobs/latest?name=${encodeURIComponent(name)}`),
    enabled,
    staleTime: 0,
  });
}
