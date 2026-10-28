import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations(): void {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Look for migration files in src/db/migrations or dist/db/migrations
  let migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    // Check root src/db/migrations if running from dist
    migrationsDir = path.resolve(process.cwd(), 'src/db/migrations');
  }

  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found at ${migrationsDir}`);
    return;
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const getApplied = db.prepare('SELECT name FROM _migrations');
  const appliedNames = new Set((getApplied.all() as { name: string }[]).map((r) => r.name));

  const insertMigration = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of migrationFiles) {
    if (!appliedNames.has(file)) {
      console.log(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      const applyTransaction = db.transaction(() => {
        db.exec(sql);
        insertMigration.run(file);
      });

      applyTransaction();
      console.log(`Successfully applied: ${file}`);
    }
  }
}
