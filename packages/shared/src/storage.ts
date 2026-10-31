/** What people see when object storage fails. The raw S3 error is logged server-side only. */
export const STORAGE_UNAVAILABLE_MESSAGE = "Storage is unavailable right now. Your project data is safe; try again in a minute.";

export type StorageFailure = "credentials" | "bucket" | "unreachable" | "other";

/** Classifies an S3 SDK error (AWS, R2, Backblaze B2 or MinIO) without exposing its message. */
export function storageFailure(error: unknown): StorageFailure {
  const e = error as { name?: string; Code?: string; code?: string; message?: string; $metadata?: { httpStatusCode?: number } } | null;
  const text = `${e?.name ?? ""} ${e?.Code ?? ""} ${e?.code ?? ""} ${e?.message ?? ""}`;
  if (/InvalidAccessKeyId|Malformed Access Key|SignatureDoesNotMatch|InvalidToken|AccessDenied|Unauthorized|Forbidden|credential/i.test(text)) return "credentials";
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|fetch failed|socket|Timeout/i.test(text)) return "unreachable";
  const status = e?.$metadata?.httpStatusCode;
  if (status === 401 || status === 403) return "credentials";
  if (/NoSuchBucket|\bNotFound\b/.test(text) || status === 404) return "bucket";
  return "other";
}
