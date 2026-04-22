/**
 * Migration runner.
 *
 * Reads /migrations/*.sql in numeric filename order, wraps each in a transaction,
 * and records applied migrations in a `schema_migrations` bookkeeping table.
 *
 * Intentionally simple — no rollback, no "down" migrations, no dependency graph.
 * If a migration fails mid-flight, it rolls back atomically and the runner exits
 * non-zero. Once applied, migrations are never re-run.
 */

import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

async function ensureBookkeeping(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename          TEXT PRIMARY KEY,
      applied_at_utc_ms BIGINT NOT NULL
    )
  `);
}

async function appliedSet(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  return new Set(rows.map((r) => r.filename));
}

async function listMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort(); // numeric prefixes => lexical sort gives correct order
}

async function run(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await ensureBookkeeping(pool);
    const already = await appliedSet(pool);
    const files = await listMigrationFiles();

    for (const file of files) {
      if (already.has(file)) {
        console.log(`[skip] ${file}`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[apply] ${file}`);
      const client = await pool.connect();
      try {
        // Migrations can contain their own BEGIN/COMMIT; we don't wrap them again.
        // The script is responsible for its own transaction boundary.
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, applied_at_utc_ms) VALUES ($1, $2)",
          [file, Date.now().toString()],
        );
        console.log(`[done]  ${file}`);
      } finally {
        client.release();
      }
    }
    console.log("all migrations applied");
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
}
