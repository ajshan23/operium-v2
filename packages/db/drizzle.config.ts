import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/operium",
  },
  // pgvector extension is created in drizzle/0000 via a manual prepend.
  verbose: true,
  strict: true,
});
