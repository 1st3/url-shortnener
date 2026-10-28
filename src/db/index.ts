import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(config.DB_PATH);

  // Performance and durability pragmas for rv415
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -16000'); // ~16MB page cache
  db.pragma('foreign_keys = ON');

  dbInstance = db;
  return dbInstance;
}

export function checkDatabaseIntegrity(): boolean {
  const db = getDatabase();
  const row = db.pragma('integrity_check') as [{ integrity_check: string }];
  return row.length > 0 && row[0].integrity_check === 'ok';
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.pragma('wal_checkpoint(TRUNCATE)');
      dbInstance.close();
    } catch (err) {
      console.error('Error closing database:', err);
    } finally {
      dbInstance = null;
    }
  }
}
