import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  // Fall back to the repo-root .env (Node 21+ built-in loader).
  try {
    process.loadEnvFile(path.join(__dirname, "../../.env"));
  } catch {}
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set — define it in the repo-root .env file");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
