import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Apply all pending migrations in ./drizzle to the DATABASE_URL target. */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
