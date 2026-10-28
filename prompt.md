# Prompt: Transform `url-shortnener` into a Production Web App for `brzl.ca`

> **Usage:** Copy and provide the prompt below to your AI coding agent (e.g. Antigravity, Claude, Cursor) within this repository to execute the complete transformation.

---

```markdown
# TASK: Build and Deploy the `brzl.ca` URL Shortener Web App

You are tasked with transforming this repository from a static `_redirects` file into a high-performance, resource-efficient, production-grade URL shortener web application running on custom domain **`brzl.ca`**, self-hosted on home server **`rv415`** and routed securely through **Cloudflare Tunnel**.

Follow all production requirements, data contracts, and architectural guidelines defined below.

---

## 1. Context & Server Environment

- **Domain:** `brzl.ca`
- **Hosting Target:** `rv415` (192.168.2.29 / Ubuntu 24.04 LTS / AMD E-300 2-core 1.3GHz APU / 6GB DDR3 RAM / SATA HDD).
- **Resource Budget & Memory Limits:**
  - **Memory Goal:** ~45–60 MB idle RSS.
  - **Docker Hard Limit:** 128 MB RAM (`mem_limit: 128m`, `mem_reservation: 64m`).
  - **Runtime Tuning:** Use Node flag `--max-old-space-size=64` to enforce aggressive V8 garbage collection, or consider Go / Bun if Node overhead exceeds limits.
  - **I/O Profile:** The host has a spinning SATA HDD. Disk writes must be minimized via SQLite WAL mode and synchronous=NORMAL. Avoid heavy build/compilation steps on the host during runtime.
- **Network Ingress:** Cloudflare Tunnel (`cloudflared` already active on `rv415` in Docker host network mode, Tunnel ID: `8315d281-8528-4dcf-95f7-285c7256c74c`). The app binds to `127.0.0.1:3005` on `rv415`, and Cloudflare proxies traffic for `brzl.ca` to this local port.
- **Role of Legacy `_redirects`:**
  - `_redirects` serves strictly as a **one-time initial import/seed source**.
  - At runtime, the SQLite database (`shortener.db`) is the **sole runtime Source of Truth (SSOT)**. The web app does *not* read or consult `_redirects` per-request.
  - The `_redirects` file remains committed in the repository for historical auditing and backup.

---

## 2. Technical Stack & Dependencies

To stay within the memory and CPU constraints of the AMD E-300:

- **Backend:** Node.js (v20+ LTS) using **Fastify** (or Hono). Fastify provides near-zero overhead, built-in schema validation via Ajv, and very low memory consumption.
- **Database:** **SQLite** via `better-sqlite3`:
  - `PRAGMA journal_mode = WAL;` (concurrent reads during writes, prevents locks)
  - `PRAGMA synchronous = NORMAL;` (dramatically lowers disk I/O on HDD)
  - `PRAGMA temp_store = MEMORY;`
  - `PRAGMA cache_size = -16000;` (~16MB memory page cache)
  - `PRAGMA foreign_keys = ON;`
- **Frontend / Dashboard:** A single-page dashboard served directly as static files from the backend container:
  - HTML5, modern vanilla TypeScript/JavaScript, and Tailwind CSS (pre-built at Docker build time).
  - No heavyweight full-stack SSR runtime (e.g., avoid Next.js server runtime, which consumes 150MB+ RSS).
- **Containerization:** Multi-stage `Dockerfile` (Node Alpine/slim build stage -> production runner) with non-root user.

---

## 3. Core Functional & Routing Specifications

### 3.1. Routing & Status Code Behavior (Consequential Definitions)

- **Root Path (`GET /`):**
  - Serves the **URL Shortener Web App** directly (`200 OK` with HTML dashboard).
  - `/admin` also renders the dashboard.
- **Active Slug (`GET /:slug`):**
  - Returns `307 Temporary Redirect` to `links.destination_url`.
  - **Caching Headers:** MUST send explicit no-cache headers:
    ```http
    Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
    Pragma: no-cache
    ```
    *Rationale:* Prevents browser and Cloudflare edge caches from freezing the target URL, allowing instant target edits, deactivation, and guaranteed click counting. (Do not use `301 Permanent Redirect` by default).
- **Unknown Slug (`GET /:slug` where slug does not exist):**
  - Returns **`404 Not Found`** with a branded, minimal HTML page ("Link not found" with link to home).
  - *Rationale:* Do **not** silently redirect unknown slugs to the fallback domain. Silent redirects mask broken links, skew analytics with typo traffic and web crawlers, and cause SEO/indexing ambiguity.
- **Disabled Slug (`GET /:slug` where `is_active = 0`):**
  - Returns **`410 Gone`** with a clean branded explanation ("This link has been deactivated").
  - *Rationale:* Conveys to clients and crawlers that the resource previously existed but was deliberately removed.
- **Reserved Slugs (System Route Protection):**
  - Slugs matching `/admin`, `/api/*`, `/health`, `/favicon.ico`, `/robots.txt`, `/static/*`, `/_*` cannot be registered as links.

### 3.2. Input Validation Rules & Collision Handling

- **Destination URL:**
  - Allowed schemes: strictly `https://` and `http://`. Reject `javascript:`, `data:`, `file:`, `ftp:`, or relative paths to prevent SSRF and XSS.
  - Max length: 2,048 characters.
- **Slug Format & Case Normalization:**
  - Format regex: `^[a-zA-Z0-9_-]{2,64}$` (min 2, max 64 characters; alphanumeric, hyphens, underscores).
  - **Normalization:** Normalize all slugs to **lowercase** on creation and lookup (e.g., `MyLink` -> `mylink`) to prevent user confusion and duplicate route conflicts.
- **Slug Collisions:**
  - Custom slug: If the normalized slug already exists in the database, reject with **`409 Conflict`**.
  - Auto-generated slug: Generate a 5-to-7 character base62/nanoid string (`[a-z0-9]`). Retry up to 5 times if collision occurs; if exhausted, return **`500 Internal Server Error`**.
- **Description / Metadata:**
  - Description: optional, max 255 characters.
- **Standardized API Error Format (RFC 7807 inspired):**
  ```json
  {
    "error": {
      "code": "SLUG_ALREADY_EXISTS | INVALID_URL | VALIDATION_ERROR | NOT_FOUND | UNAUTHORIZED",
      "message": "Human-readable description of error.",
      "details": []
    }
  }
  ```

### 3.3. Analytics, Privacy Limits & Retention

- **Privacy Requirements:**
  - **Never store raw IP addresses.** Rely on Cloudflare's `CF-IPCountry` header for geographic logging.
  - If IP hashing is enabled, store only a one-way salted daily SHA-256 hash or truncate to subnet (`/24` for IPv4).
  - **Referrer sanitization:** Strip sensitive query strings from the `Referer` header before persisting (e.g., remove `token=`, `session=`, `key=`).
  - **User-Agent:** Truncate to a maximum of 128 characters or store parsed OS and browser category.
- **Retention & Data Pruning:**
  - Individual `click_events` are retained for **90 days** (`ANALYTICS_RETENTION_DAYS=90`).
  - The aggregate `click_count` and `last_accessed_at` on the `links` table remain permanently.
  - Storage expectation: ~120 bytes per click. At 10,000 clicks/month, 90 days occupies < 4 MB of disk space. Total database size will comfortably remain < 20 MB.

### 3.4. Analytics Ingestion & Persistence Policy (Queueing, Concurrency & Failure Recovery)

Because `better-sqlite3` executes synchronously and `rv415` runs on a spinning 2.5" SATA HDD, writing analytics synchronously before redirecting would add 10–50ms disk I/O latency to every visitor request. To eliminate redirect delay while protecting server memory and data integrity, the following policy is strictly required:

- **Decoupled Redirect & Enqueue:**
  1. The route handler performs a fast, memory-cached SQLite read:
     `SELECT id, destination_url FROM links WHERE slug = ? AND is_active = 1`
  2. The handler **immediately** responds with `307 Temporary Redirect` to the visitor.
  3. The handler pushes the click payload into an in-memory queue (`analyticsQueue.push({...})`). The visitor connection completes without waiting on disk writes.
- **Batched Persistence:**
  - The in-memory queue buffers events and flushes them to SQLite in bulk:
    - **Trigger:** Flush whenever the queue accumulates **50 events**, OR every **1,000 ms** via a timer, whichever occurs first.
    - **Atomic Transaction:** Flushed events are committed in a single SQLite transaction:
      ```sql
      BEGIN TRANSACTION;
      -- Insert all queued click_events in batch
      INSERT INTO click_events (link_id, clicked_at, country, referrer, user_agent) VALUES (...);
      -- Batch-update links click_count and last_accessed_at
      UPDATE links SET click_count = click_count + ?, last_accessed_at = ? WHERE id = ?;
      COMMIT;
      ```
    - *Impact:* Batching 50 events in a single transaction reduces HDD write cycles by 98%.
- **Crash & Data Loss Tolerance (Accepted Policy):**
  - **Explicit Trade-Off:** Visitor redirect latency and disk health are prioritized over zero-data-loss durability for analytics. In an ungraceful crash (e.g., `kill -9`, sudden power loss to `rv415`), at most **1 second of click data (max 50 events)** may be lost. This is an explicit, accepted system trade-off.
  - **Graceful Shutdown (`SIGTERM` / `SIGINT`):** On process shutdown, the server stops accepting new HTTP connections, immediately flushes all pending events in the queue to SQLite within a 5-second deadline, runs `PRAGMA wal_checkpoint(TRUNCATE)`, closes the DB handle, and exits cleanly. Zero events are lost during normal deployments or container restarts.
- **Queue Overflow & Backpressure Policy:**
  - The in-memory queue has a hard upper bound of **5,000 events** (occupies < 1 MB RAM, preventing memory leaks on `rv415`).
  - If the queue fills (e.g., during a traffic surge, crawler flood, or transient disk I/O freeze):
    - **Drop Strategy:** Drop excess incoming analytics events (`drop-oldest`) and increment an internal dropped event counter.
    - **Availability Invariant:** Never block, throttle, or fail the redirect response. The redirect always succeeds regardless of queue state.
    - Log a rate-limited warning: `[WARN] Analytics queue full (>5000 items). Dropping click events to preserve redirect responsiveness.`
- **Write Failure Handling:**
  - If a batch write fails (e.g., temporary `SQLITE_BUSY` lock):
    - Retry the batch once after a 500 ms backoff.
    - If the retry fails, log an error (`[ERROR] Analytics batch write failed: <err>`), discard the failing batch to prevent unbounded queue growth, and continue servicing requests. Never allow database write errors to crash the process.
- **Automated Retention & Pruning Scheduler:**
  - An internal scheduler runs daily (e.g., at 03:00 UTC) executing:
    ```sql
    DELETE FROM click_events WHERE clicked_at < datetime('now', '-90 days');
    ```
  - Followed by `PRAGMA incremental_vacuum;` or SQLite page optimization to reclaim space on disk.

---

## 4. Database Architecture & Migrations

### 4.1. Schema

```sql
-- Migration tracking table
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Links table (Source of Truth)
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
    destination_url TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    click_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
CREATE INDEX IF NOT EXISTS idx_links_active ON links(is_active);

-- Click analytics table (Pruned to 90 days)
CREATE TABLE IF NOT EXISTS click_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    country TEXT,
    referrer TEXT,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_clicks_link_id ON click_events(link_id);
CREATE INDEX IF NOT EXISTS idx_clicks_timestamp ON click_events(clicked_at);
```

### 4.2. Migration & Seeding Lifecycle
1. On application startup, the migration runner checks `_migrations` and applies pending SQL migration files sequentially inside a transaction.
2. If `links` table is empty and `_redirects` exists, run `seed-redirects` automatically to import existing routes (`/br`, `/wb`, `/o7`, `/co`, `/dr`, `/store`, `/todo`, `/profile`, `/twitter`) with `is_active=1`.
3. If an existing slug is already present during seed, ignore/skip without error (`INSERT OR IGNORE`).

---

## 5. Persistence, Backup, Restore & Rollback

### 5.1. SQLite File Persistence
- The database is stored on the host at `./data/shortener.db` and mounted into the container at `/app/data/shortener.db`.
- Docker container updates, rebuilds, and restarts **never touch or delete** host directory `./data`.

### 5.2. Backup Strategy (`scripts/backup.sh`)
- Use SQLite's online, non-blocking backup API to take consistent snapshots without stopping traffic:
  ```bash
  sqlite3 /app/data/shortener.db "VACUUM INTO '/app/data/backups/shortener_$(date +%Y%m%d_%H%M%S).db'"
  ```
- Retain the last 7 daily backups and 4 weekly backups; prune older ones.
- Schedule via cron on `rv415` (e.g., daily at 03:00 AM).

### 5.3. Restore Procedure
1. Stop container: `docker compose down`
2. Backup broken/current file: `cp ./data/shortener.db ./data/shortener.db.corrupt`
3. Copy chosen backup snapshot to `./data/shortener.db`.
4. Validate integrity: `sqlite3 ./data/shortener.db "PRAGMA integrity_check;"`
5. Restart container: `docker compose up -d`

### 5.4. Rollback Strategy
- Production images are tagged with Git commit hash and `:latest` (`brzl-shortener:latest` and `brzl-shortener:${GIT_COMMIT}`).
- If a new deployment fails health checks:
  1. Revert container to previous image: `docker compose down && docker compose up -d brzl-shortener:<previous_commit>`
  2. If a migration broke backwards compatibility, restore the pre-deployment database backup taken immediately prior to the update.

---

## 6. Admin API & Web Dashboard

### 6.1. Authentication
- Check for `Authorization: Bearer <ADMIN_API_KEY>` or session cookie.
- If behind Cloudflare Access, optionally trust `Cf-Access-Authenticated-User-Email` matching authorized admin emails.

### 6.2. REST Endpoints
- `GET /api/links`: List links (supports `?search=`, `?page=`, `?limit=25`, `?status=active|disabled`).
- `POST /api/links`: Create link (`{ "url": "https://...", "slug": "optional", "description": "optional" }`).
- `GET /api/links/:id`: Get single link details + last 50 click events.
- `PUT /api/links/:id`: Edit link destination URL, slug, description, or toggle `is_active`.
- `DELETE /api/links/:id`: Delete a link and cascade delete its click events.
- `GET /api/stats`: Dashboard summary counts (total links, active links, total clicks, clicks last 24h, top 5 links).
- `GET /health`: Liveness probe (`200 OK {"status":"healthy","uptime":...}`).

### 6.3. Admin Web Dashboard (`/admin`)
- Dark-mode, responsive UI built with Tailwind CSS.
- **Top Quick Bar:** Input for destination URL, optional slug, and one-click "Create Short Link".
- **Links Table:**
  - Formatted link: `brzl.ca/<slug>` with instant "Copy Link" clipboard button.
  - Target URL preview with truncation.
  - Active toggle switch (instantly activates or deactivates link).
  - Total clicks badge.
  - QR Code button: Opens a clean SVG modal with download and copy options.
  - Edit and Delete modal.
- **Filter & Search:** Live debounce search across slugs, targets, and descriptions.

---

## 7. File Structure Specification

```
.
├── src/
│   ├── index.ts                 # Server bootstrap, signal handling, graceful shutdown
│   ├── config.ts                # Validated environment variables (Zod or Ajv)
│   ├── db/
│   │   ├── index.ts             # SQLite connection, pragmas, WAL management
│   │   ├── migrations/          # Version-controlled SQL migrations
│   │   │   ├── 001_initial.sql
│   │   │   └── 002_indices.sql
│   │   ├── migrate.ts           # Schema migration runner
│   │   └── seed.ts              # Legacy _redirects seed importer
│   ├── routes/
│   │   ├── redirect.ts          # /:slug handler, no-cache headers, 404/410 handlers
│   │   ├── api.ts               # REST API endpoints (/api/links, /api/stats)
│   │   └── health.ts            # /health check
│   ├── services/
│   │   ├── analyticsQueue.ts    # In-memory batch queue, flush timer & shutdown drain
│   │   └── pruning.ts           # Daily 90-day retention cleanup & vacuum scheduler
│   ├── middleware/
│   │   ├── auth.ts              # Bearer key & Cloudflare Access header auth
│   │   └── errorHandler.ts      # RFC 7807 error formatter
│   └── public/                  # Admin UI static assets
│       ├── index.html
│       ├── app.js
│       └── styles.css
├── data/                        # Host directory mounted into container (gitignored)
│   ├── shortener.db
│   └── backups/
├── scripts/
│   ├── seed-redirects.ts        # Standalone CLI to seed from _redirects
│   ├── backup.sh                # Online SQLite VACUUM backup script
│   └── deploy-rv415.sh          # Deployment script targeting rv415
├── _redirects                   # Historical legacy file (seed source, preserved in git)
├── Dockerfile                   # Multi-stage build (Node 20 Alpine)
├── docker-compose.yml           # Production container definition
├── package.json
├── tsconfig.json
└── README.md                    # Operational handbook & setup instructions
```

---

## 8. Cloudflare Tunnel & Docker Compose Configuration

### 8.1. `docker-compose.yml`
```yaml
version: '3.8'

services:
  url-shortener:
    build:
      context: .
      dockerfile: Dockerfile
    image: brzl-shortener:latest
    container_name: brzl-shortener
    restart: unless-stopped
    ports:
      - "127.0.0.1:3005:3005"
    environment:
      - NODE_ENV=production
      - PORT=3005
      - BASE_URL=https://brzl.ca
      - ADMIN_API_KEY=${ADMIN_API_KEY}
      - DEFAULT_FALLBACK_URL=https://brasileiro.ca
      - DB_PATH=/app/data/shortener.db
      - ANALYTICS_RETENTION_DAYS=90
      - NODE_OPTIONS=--max-old-space-size=64
    volumes:
      - ./data:/app/data
    deploy:
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 64M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3005/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### 8.2. Cloudflare Ingress Rule
On `rv415`, Cloudflare Tunnel (`8315d281-8528-4dcf-95f7-285c7256c74c`) route:
- Hostname: `brzl.ca`
- Service: `http://127.0.0.1:3005`
- Pass through headers: `CF-Connecting-IP`, `CF-IPCountry`, `Cf-Access-Authenticated-User-Email`.

---

## 9. Implementation Plan

Execute the transformation step-by-step:

1. **Project & Tooling Setup:** Initialize `package.json`, TypeScript, and build scripts.
2. **Database & Migration Engine:**
   - Implement `better-sqlite3` with WAL mode pragmas.
   - Create migration runner (`_migrations` table) and schema files.
   - Create seed importer from `_redirects` (`scripts/seed-redirects.ts`).
3. **Core Redirection Engine & Analytics Queue:**
   - Implement `GET /:slug` with instant `307 Temporary Redirect` and strict `Cache-Control: private, no-cache, no-store`.
   - Implement `404 Not Found` for unknown slugs and `410 Gone` for disabled slugs.
   - Decouple redirection from DB writes: enqueue events into an in-memory batch queue (`analyticsQueue.ts`).
   - Implement batched transaction flushing (every 50 events or 1,000 ms).
   - Implement queue capacity bounding (max 5,000 items, drop-oldest backpressure without failing redirects).
   - Implement graceful shutdown handler to flush remaining events on `SIGTERM`/`SIGINT`.
4. **Admin REST API:**
   - Full CRUD on `/api/links` with validation (URL scheme, slug regex, 409 collision check).
   - `/api/stats` endpoint.
   - Auth middleware supporting `ADMIN_API_KEY` and CF Access headers.
5. **Admin UI Dashboard:**
   - Responsive dark-mode dashboard at `/admin`.
   - Link creation, QR code modal, search/filter, and copy button.
6. **Maintenance & Backup Scripts:**
   - Write `scripts/backup.sh` for non-blocking SQLite snapshot backups.
   - Write daily 90-day analytics cleanup routine.
   - Write `scripts/deploy-rv415.sh` for remote deployment and safe restart.
7. **Containerization & Verification:**
   - Build multi-stage `Dockerfile` and `docker-compose.yml` with memory limits.
   - Run integration tests: verify active redirects (`/br`, `/wb`), verify 404 on unknown slugs, verify 410 on disabled slugs, verify 409 on duplicate custom slugs, and verify persistence of SQLite data across container recreation.
```
