import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const queue = new Queue("stage-ready-jobs", { connection });
const worker = new Worker("stage-ready-jobs", async (job) => ({ jobId: job.id, status: "accepted" }), { connection });
worker.on("completed", (job) => console.info(`Job ${job.id} completed.`));
worker.on("failed", (job, error) => console.error(`Job ${job?.id ?? "unknown"} failed: ${error.message}`));
console.info("Stage Ready worker is listening.");
void queue;
