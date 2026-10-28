import { getDatabase } from '../db/index.js';

export interface ClickEventPayload {
  linkId: number;
  country?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
}

export class AnalyticsQueue {
  private queue: ClickEventPayload[] = [];
  private readonly maxQueueSize = 5000;
  private readonly batchSize = 50;
  private readonly flushIntervalMs = 1000;
  private timer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private droppedCount = 0;

  constructor() {
    this.timer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);

    // Unref timer so it doesn't prevent Node process from exiting
    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public enqueue(event: ClickEventPayload): void {
    if (this.queue.length >= this.maxQueueSize) {
      // Drop oldest to preserve memory and avoid OOM
      this.queue.shift();
      this.droppedCount++;
      if (this.droppedCount % 100 === 1) {
        console.warn(
          `[WARN] Analytics queue saturated (> ${this.maxQueueSize} items). Dropped ${this.droppedCount} total click events.`
        );
      }
    }

    this.queue.push(event);

    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  public flush(): void {
    if (this.isFlushing || this.queue.length === 0) {
      return;
    }

    this.isFlushing = true;
    const batch = this.queue.splice(0, this.batchSize);

    try {
      this.writeBatch(batch);
    } catch (err) {
      console.error('[ERROR] Analytics batch write failed, retrying once...', err);
      // Wait 500ms and retry once
      setTimeout(() => {
        try {
          this.writeBatch(batch);
        } catch (retryErr) {
          console.error('[ERROR] Analytics batch retry failed. Discarding batch.', retryErr);
        }
      }, 500);
    } finally {
      this.isFlushing = false;
    }
  }

  private writeBatch(batch: ClickEventPayload[]): void {
    if (batch.length === 0) return;

    const db = getDatabase();

    const insertClickStmt = db.prepare(`
      INSERT INTO click_events (link_id, country, referrer, user_agent)
      VALUES (?, ?, ?, ?)
    `);

    const updateLinkStmt = db.prepare(`
      UPDATE links
      SET click_count = click_count + ?,
          last_accessed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // Aggregate counts per link_id to execute fewer UPDATE statements
    const linkCounts = new Map<number, number>();
    for (const item of batch) {
      linkCounts.set(item.linkId, (linkCounts.get(item.linkId) || 0) + 1);
    }

    const transaction = db.transaction(() => {
      for (const item of batch) {
        insertClickStmt.run(
          item.linkId,
          item.country || null,
          item.referrer || null,
          item.userAgent || null
        );
      }

      for (const [linkId, count] of linkCounts.entries()) {
        updateLinkStmt.run(count, linkId);
      }
    });

    transaction();
  }

  public getStats(): { pendingCount: number; droppedCount: number } {
    return {
      pendingCount: this.queue.length,
      droppedCount: this.droppedCount,
    };
  }

  public async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    console.log(`Draining ${this.queue.length} pending analytics events before shutdown...`);
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      try {
        this.writeBatch(batch);
      } catch (err) {
        console.error('[ERROR] Error writing remaining analytics during shutdown:', err);
        break;
      }
    }
    console.log('Analytics queue drained successfully.');
  }
}

export const analyticsQueue = new AnalyticsQueue();
