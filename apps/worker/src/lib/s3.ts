import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { WorkerEnv } from "@stage-ready/config";

export interface Storage {
  putJson(key: string, value: unknown): Promise<string>;
  getJson<T>(key: string): Promise<T | null>;
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
  return {
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
