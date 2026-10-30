import type { NextConfig } from "next";
import { loadRootEnv } from "@stage-ready/config";

// One .env at the repo root serves every app.
loadRootEnv();

const nextConfig: NextConfig = {
  // A second dev server (the e2e guest server on :3100) needs its own build folder, or the two corrupt each other.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  transpilePackages: ["@stage-ready/shared", "@stage-ready/config", "@stage-ready/db", "@stage-ready/ai"],
  serverExternalPackages: ["pino", "bullmq", "ioredis", "postgres"],
};

export default nextConfig;
