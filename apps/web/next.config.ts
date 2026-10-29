import type { NextConfig } from "next";
import { loadRootEnv } from "@stage-ready/config";

// One .env at the repo root serves every app.
loadRootEnv();

const nextConfig: NextConfig = {
  transpilePackages: ["@stage-ready/shared", "@stage-ready/config", "@stage-ready/db", "@stage-ready/ai"],
  serverExternalPackages: ["pino", "bullmq", "ioredis", "postgres"],
};

export default nextConfig;
