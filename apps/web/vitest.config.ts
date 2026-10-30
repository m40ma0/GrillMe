import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only; Playwright owns e2e/. "server-only" throws outside React Server Components, so tests stub it.
export default defineConfig({
  resolve: { alias: { "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)), "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { exclude: ["e2e/**", "node_modules/**", ".next/**"], passWithNoTests: true },
});
