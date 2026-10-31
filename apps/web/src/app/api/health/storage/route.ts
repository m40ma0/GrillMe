import { storageHealth } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/** 200 {"ok":true} when the S3 keys can reach the bucket; 503 {"ok":false,"reason":"credentials"|...} otherwise. */
export async function GET() {
  const health = await storageHealth();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}
