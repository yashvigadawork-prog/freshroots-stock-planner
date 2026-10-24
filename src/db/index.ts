import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

/**
 * Real Postgres (Neon) when DATABASE_URL is set. Otherwise an on-disk embedded Postgres for
 * local use, so the app runs on a laptop with no accounts. Pass { memory: true } in tests.
 */
export async function createDb(opts: { memory?: boolean } = {}): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url && !opts.memory) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url, max: 5 });
    const db = drizzle(pool, { schema });
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder });
    return db as unknown as Db;
  }
  if (process.env.VERCEL && !opts.memory) {
    throw new Error("DATABASE_URL is not set. Add your Neon connection string in the Vercel project's environment variables.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  let dataDir: string | undefined;
  if (!opts.memory) {
    dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}

const g = globalThis as unknown as { __freshrootsDb?: Promise<Db> };

/** One shared connection per server process. */
export function getDb(): Promise<Db> {
  return (g.__freshrootsDb ??= (async () => {
    const db = await createDb();
    const { seedIfEmpty } = await import("@/lib/services/seed");
    await seedIfEmpty(db);
    return db;
  })());
}

export { schema };
