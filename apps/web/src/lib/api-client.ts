import type { ApiErrorBody } from "@/lib/types";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : (rest.body ?? null),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(response.status, parsed?.error.code ?? "http_error", parsed?.error.message ?? `Request failed with ${response.status}.`, parsed?.error.detail ?? null);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
