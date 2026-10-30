import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { WorkerEnv } from "@stage-ready/config";

export interface Storage {
  putJson(key: string, value: unknown): Promise<string>;
  getJson<T>(key: string): Promise<T | null>;
  /** Stores bytes and returns their s3:// URI. */
  put(key: string, body: Uint8Array | string, contentType: string): Promise<string>;
  get(uri: string): Promise<Uint8Array | null>;
  /** A presigned GET (15 minutes) for an s3:// URI in this bucket; null for anything else. */
  presignGet(uri: string, expiresIn?: number): Promise<string | null>;
  /** A presigned PUT and the s3:// URI the object will have. */
  presignPut(key: string, contentType: string, expiresIn?: number): Promise<{ url: string; uri: string }>;
}

export function createStorage(env: WorkerEnv): Storage {
  const client = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } });
  let ready: Promise<void> | null = null;
  const ensureBucket = () =>
    (ready ??= client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET })).then(
      () => undefined,
      async () => {
        await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      },
    ));
  const prefix = `s3://${env.S3_BUCKET}/`;
  const keyOf = (uri: string) => (uri.startsWith(prefix) ? uri.slice(prefix.length) : null);
  return {
    async put(key, body, contentType) {
      await ensureBucket();
      await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
      return `${prefix}${key}`;
    },
    async get(uri) {
      const key = keyOf(uri);
      if (!key) return null;
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
        return (await out.Body?.transformToByteArray()) ?? null;
      } catch {
        return null;
      }
    },
    async presignGet(uri, expiresIn = 900) {
      const key = keyOf(uri);
      return key ? getSignedUrl(client, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn }) : null;
    },
    async presignPut(key, contentType, expiresIn = 3600) {
      await ensureBucket();
      return { url: await getSignedUrl(client, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn }), uri: `${prefix}${key}` };
    },
    async putJson(key, value) {
      await ensureBucket();
      await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: JSON.stringify(value), ContentType: "application/json" }));
      return `s3://${env.S3_BUCKET}/${key}`;
    },
    async getJson<T>(key: string) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
        const text = await out.Body?.transformToString();
        return text ? (JSON.parse(text) as T) : null;
      } catch {
        return null;
      }
    },
  };
}
