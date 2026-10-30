import "server-only";
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

const g = globalThis as unknown as { stageReadyS3?: S3Client; stageReadyBucket?: Promise<void> };

function client(): S3Client {
  const e = env();
  g.stageReadyS3 ??= new S3Client({ endpoint: e.S3_ENDPOINT, region: e.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY } });
  return g.stageReadyS3;
}

function ensureBucket(): Promise<void> {
  g.stageReadyBucket ??= client()
    .send(new HeadBucketCommand({ Bucket: env().S3_BUCKET }))
    .then(
      () => undefined,
      async () => void (await client().send(new CreateBucketCommand({ Bucket: env().S3_BUCKET }))),
    );
  return g.stageReadyBucket;
}

/** A presigned PUT, valid for 15 minutes. The browser uploads straight to S3/R2. */
export async function presignPut(key: string, contentType: string): Promise<{ url: string; key: string; expiresIn: number }> {
  await ensureBucket();
  const expiresIn = 900;
  const url = await getSignedUrl(client(), new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn });
  return { url, key, expiresIn };
}

/** A presigned GET, valid for 15 minutes, for an s3:// URI in this project's bucket. */
export async function presignGet(uri: string): Promise<string | null> {
  const prefix = `s3://${env().S3_BUCKET}/`;
  if (!uri.startsWith(prefix)) return null;
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: uri.slice(prefix.length) }), { expiresIn: 900 });
}

export const s3Uri = (key: string) => `s3://${env().S3_BUCKET}/${key}`;
