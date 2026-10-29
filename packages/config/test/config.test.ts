import { describe, expect, it } from "vitest";
import { ConfigError, WebEnv, WorkerEnv, openSecret, parseEnv, sealSecret } from "../src";

const base = {
  DATABASE_URL: "postgres://stage:stage@localhost:5432/stageready",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "stage-ready",
  S3_ACCESS_KEY: "a",
  S3_SECRET_KEY: "b",
  AUTH_SECRET: "0123456789abcdef0123",
  REALTIME_URL: "ws://localhost:4000",
  REALTIME_JWT_SECRET: "0123456789abcdef0123",
};

describe("env validation", () => {
  it("treats empty model values as unset and defaults to mocked JSON mode", () => {
    const env = parseEnv("worker", WorkerEnv, { ...base, META_API_KEY: "", MODEL_SPARK: "", EMBED_DIM: "" });
    expect(env.META_API_KEY).toBeUndefined();
    expect(env.EMBED_DIM).toBeUndefined();
    expect(env.META_RESPONSE_FORMAT).toBe("json_object");
  });
  it("names every missing value", () => {
    expect(() => parseEnv("worker", WorkerEnv, {})).toThrow(ConfigError);
    expect(() => parseEnv("worker", WorkerEnv, {})).toThrow(/DATABASE_URL/);
  });
  it("requires GitHub OAuth unless the dev bypass is on, and forbids the bypass in production", () => {
    expect(() => parseEnv("web", WebEnv, base)).toThrow(/AUTH_GITHUB_ID/);
    expect(parseEnv("web", WebEnv, { ...base, DEV_AUTH_BYPASS: "true" }).DEV_AUTH_BYPASS).toBe(true);
    expect(() => parseEnv("web", WebEnv, { ...base, DEV_AUTH_BYPASS: "true", NODE_ENV: "production" })).toThrow(/production/);
  });
});

describe("sealed secrets", () => {
  it("round-trips and rejects the wrong key", () => {
    const sealed = sealSecret("gho_token", "secret-one-long-enough");
    expect(sealed).not.toContain("gho_token");
    expect(openSecret(sealed, "secret-one-long-enough")).toBe("gho_token");
    expect(() => openSecret(sealed, "secret-two-long-enough")).toThrow();
  });
});

describe("session tokens", () => {
  it("verifies scoped claims and rejects expired or foreign tokens", async () => {
    const { signSessionToken, verifySessionToken } = await import("../src");
    const claims = { sid: "01a186d2-229a-7a27-a55c-28567aaf817a", pid: "01a186d2-229a-7a27-a55c-28567aaf817b", uid: "01a186d2-229a-7a27-a55c-28567aaf817c" };
    const secret = "0123456789abcdef0123";
    const token = await signSessionToken(claims, secret);
    await expect(verifySessionToken(token, secret)).resolves.toMatchObject(claims);
    await expect(verifySessionToken(token, "another-secret-of-length")).rejects.toThrow();
    const old = await signSessionToken(claims, secret, Date.now() - 16 * 60_000);
    await expect(verifySessionToken(old, secret)).rejects.toThrow();
  });
});
