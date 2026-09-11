import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(SERVER_ROOT, "data");
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "movie-tracker.sqlite");
const MIGRATIONS_DIR = path.join(SERVER_ROOT, "db", "migrations");

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

export const db = new DatabaseSync(DATABASE_PATH, { timeout: 5000 });

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`);

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare("SELECT filename FROM schema_migrations ORDER BY filename").all().map(
      (row) => row.filename,
    ),
  );

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  for (const filename of migrationFiles) {
    if (applied.has(filename)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");

    db.exec("BEGIN");

    try {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)",
      ).run(filename, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Failed to apply database migration ${filename}: ${error.message}`, {
        cause: error,
      });
    }
  }
}

runMigrations();

export function closeDatabase() {
  if (db.isOpen) {
    db.close();
  }
}

export { DATABASE_PATH };
