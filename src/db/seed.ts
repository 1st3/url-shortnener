import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from './index.js';

export function seedFromRedirects(redirectsFilePath?: string): { seeded: number; skipped: number } {
  const db = getDatabase();
  const filePath = redirectsFilePath || path.resolve(process.cwd(), '_redirects');

  if (!fs.existsSync(filePath)) {
    console.log(`No _redirects file found at ${filePath}. Skipping seed.`);
    return { seeded: 0, skipped: 0 };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO links (slug, destination_url, description, is_active)
    VALUES (?, ?, ?, 1)
  `);

  let seeded = 0;
  let skipped = 0;

  const seedTransaction = db.transaction(() => {
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      // Split by whitespace
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const pathPart = parts[0].trim();
      const targetUrl = parts[1].trim();

      // Skip wildcard catch-all (handled by fallback configuration)
      if (pathPart === '/*' || pathPart === '*') {
        continue;
      }

      // Extract slug: remove leading slash and normalize to lowercase
      const slug = pathPart.replace(/^\/+/, '').toLowerCase();
      if (!slug || !targetUrl.startsWith('http')) {
        continue;
      }

      const info = insertStmt.run(slug, targetUrl, `Imported from legacy _redirects (${pathPart})`);
      if (info.changes > 0) {
        seeded++;
      } else {
        skipped++;
      }
    }
  });

  seedTransaction();
  return { seeded, skipped };
}
