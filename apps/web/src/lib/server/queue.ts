import "server-only";
import { JobPayload, QUEUE_NAME } from "@stage-ready/shared";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

const globalForQueue = globalThis as unknown as { stageReadyQueue?: Queue; stageReadyRedis?: IORedis };

export function redis(): IORedis {
  globalForQueue.stageReadyRedis ??= new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  return globalForQueue.stageReadyRedis;
}

export function queue(): Queue {
  globalForQueue.stageReadyQueue ??= new Queue(QUEUE_NAME, {
    connection: redis(),
    defaultJobOptions: { attempts: 1, removeOnComplete: { age: 86_400, count: 500 }, removeOnFail: { age: 7 * 86_400 } },
  });
  return globalForQueue.stageReadyQueue;
}

export async function enqueue(payload: JobPayload): Promise<string> {
  const { name, ...data } = JobPayload.parse(payload);
  const job = await queue().add(name, data);
  if (!job.id) throw new Error("The queue did not return a job id.");
  return job.id;
}
