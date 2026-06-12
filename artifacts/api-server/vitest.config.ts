import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests import modules that read env at load time (db connection string,
// API keys). Load the repo-root .env so unit tests run without a wrapper.
// No test in this suite actually connects to the database or the API.
try {
  process.loadEnvFile(path.join(__dirname, "../../.env"));
} catch {}

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
