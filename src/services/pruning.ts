import { getDatabase } from '../db/index.js';
import { config } from '../config.js';

export function pruneOldAnalytics(retentionDays = config.ANALYTICS_RETENTION_DAYS): { deletedCount: number } {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM click_events
      WHERE clicked_at < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(retentionDays);

    // Optimize database pages lightly without full locking
    db.pragma('optimize');

    if (result.changes > 0) {
      console.log(`[PRUNING] Cleaned up ${result.changes} click events older than ${retentionDays} days.`);
    }

    return { deletedCount: result.changes };
  } catch (err) {
    console.error('[ERROR] Failed to prune old analytics:', err);
    return { deletedCount: 0 };
  }
}

export function startPruningScheduler(): NodeJS.Timeout {
  // Run once shortly after startup (after 10s)
  setTimeout(() => {
    pruneOldAnalytics();
  }, 10_000);

  // Then run every 24 hours
  const intervalMs = 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    pruneOldAnalytics();
  }, intervalMs);

  if (timer.unref) {
    timer.unref();
  }

  return timer;
}
