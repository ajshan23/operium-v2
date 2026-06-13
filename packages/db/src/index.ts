import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Lazily-constructed Drizzle client. Reads DATABASE_URL at first use so importing
 * the package (e.g. for types or migrations) never requires a live connection.
 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

export { schema };
