import { runMigrations } from '../src/db/migrate.js';
import { seedFromRedirects } from '../src/db/seed.js';
import { closeDatabase, checkDatabaseIntegrity } from '../src/db/index.js';

console.log('Running database migrations...');
runMigrations();

console.log('Checking database integrity...');
const isOk = checkDatabaseIntegrity();
if (!isOk) {
  console.error('Database integrity check failed!');
  process.exit(1);
}
console.log('Database integrity verified: OK');

console.log('Seeding from _redirects...');
const result = seedFromRedirects();
console.log(`Seed complete: ${result.seeded} seeded, ${result.skipped} skipped/already present.`);

closeDatabase();
console.log('Done.');
