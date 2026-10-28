# Implementation Progress: `brzl.ca` URL Shortener Web App

This document tracks the phased implementation of transforming this repository into a production-grade URL shortener web application running on custom domain **`brzl.ca`**, self-hosted on **`rv415`** and routed via **Cloudflare Tunnel**.

For full system architecture, hardware limits, data contracts, and policies, refer to [`prompt.md`](./prompt.md).

---

## High-Level Status Dashboard

| Phase | Milestone | Status | GitHub Issue |
|---|---|---|---|
| **Phase 1** | Project Setup, Fastify & TypeScript Foundation | ✅ Done | [#2](https://github.com/1st3/url-shortnener/issues/2) |
| **Phase 2** | SQLite Database Layer, WAL Mode & Legacy Seeding | ✅ Done | [#3](https://github.com/1st3/url-shortnener/issues/3) |
| **Phase 3** | Redirection Engine, Caching & Route Guards | ✅ Done | [#4](https://github.com/1st3/url-shortnener/issues/4) |
| **Phase 4** | Decoupled Analytics Queue & 90-Day Retention Pruning | ✅ Done | [#5](https://github.com/1st3/url-shortnener/issues/5) |
| **Phase 5** | Admin REST API & Authentication Middleware | ⏳ Pending | [#6](https://github.com/1st3/url-shortnener/issues/6) |
| **Phase 6** | Modern Admin Dashboard UI & QR Code Generator | ⏳ Pending | [#7](https://github.com/1st3/url-shortnener/issues/7) |
| **Phase 7** | Deployment, Docker Compose, Backups & Cloudflare Ingress | ⏳ Pending | [#8](https://github.com/1st3/url-shortnener/issues/8) |

---

## Detailed Task Breakdown

### Phase 1: Project Setup, Fastify & TypeScript Foundation
- [x] Initialize `package.json` with Node.js 20+ LTS target and module configuration.
- [x] Setup TypeScript (`tsconfig.json`) with strict typing and ES2022 target.
- [x] Install Fastify core, static file plugin, and validation dependencies.
- [x] Configure environment schema (`src/config.ts`) with runtime validation (ports, URLs, secrets, paths).
- [x] Implement server entry point (`src/index.ts`) with graceful shutdown hooks (`SIGINT`, `SIGTERM`).
- [x] Verify baseline memory footprint (< 60MB idle RSS).

### Phase 2: SQLite Database Layer, WAL Mode & Legacy Seeding
- [x] Configure `better-sqlite3` connection (`src/db/index.ts`) with WAL mode and `synchronous = NORMAL`.
- [x] Create version-tracked migration engine (`src/db/migrate.ts`) and `_migrations` table.
- [x] Author initial schema migration (`src/db/migrations/001_initial.sql`) for `links` and `click_events`.
- [x] Implement one-time seed importer (`scripts/seed-redirects.ts`) parsing `_redirects` into SQLite (`INSERT OR IGNORE`).
- [x] Add database integrity check routines (`PRAGMA integrity_check`).

### Phase 3: Redirection Engine, Caching & Route Guards
- [x] Implement `GET /:slug` handler in `src/routes/redirect.ts`.
- [x] Enforce `307 Temporary Redirect` with strict headers:
  `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
- [x] Implement branded **`404 Not Found`** HTML page for unknown slugs (no silent redirects).
- [x] Implement branded **`410 Gone`** HTML page for deactivated slugs (`is_active = 0`).
- [x] Implement root path redirect `GET /` to `DEFAULT_FALLBACK_URL`.
- [x] Add route guards for reserved system paths (`/admin`, `/api/*`, `/health`, `/static/*`).

### Phase 4: Decoupled Analytics Queue & 90-Day Retention Pruning
- [x] Build in-memory batch queue (`src/services/analyticsQueue.ts`) decoupled from visitor redirect responses.
- [x] Implement batch flush mechanism: commit to SQLite every **50 events** or **1,000 ms** in a single transaction.
- [x] Implement queue bounding (max 5,000 items) with drop-oldest overflow policy (never fail redirects).
- [x] Add graceful shutdown queue drain with 5-second deadline.
- [x] Implement privacy masking: extract `CF-IPCountry`, strip query parameters from `Referer`, sanitize `User-Agent`.
- [x] Implement daily automated retention pruning (`src/services/pruning.ts`) deleting `click_events` > 90 days.

### Phase 5: Admin REST API & Authentication Middleware
- [ ] Build authentication middleware (`src/middleware/auth.ts`) supporting `ADMIN_API_KEY` and `Cf-Access-Authenticated-User-Email`.
- [ ] Implement RFC 7807 standardized JSON error handler (`src/middleware/errorHandler.ts`).
- [ ] Implement `GET /api/links` with pagination, search filter, and click aggregates.
- [ ] Implement `POST /api/links` with URL schema validation (`http/https`), lowercase slug normalization, and `409 Conflict` checks.
- [ ] Implement auto-generated slug generator (nanoid base62) with 5-attempt collision retry.
- [ ] Implement `GET /api/links/:id`, `PUT /api/links/:id`, and `DELETE /api/links/:id`.
- [ ] Implement `GET /api/stats` and `GET /health` liveness probe.

### Phase 6: Modern Admin Dashboard UI & QR Code Generator
- [ ] Create lightweight, dark-mode single-page UI at `/admin` (`src/public/index.html`, `app.js`, `styles.css`).
- [ ] Build "Quick Shorten" input bar with custom slug option and instant creation.
- [ ] Build links table with real-time debounce search across slugs, targets, and descriptions.
- [ ] Add 1-click clipboard copy button for short URLs (`brzl.ca/<slug>`).
- [ ] Add link activation/deactivation toggle switch.
- [ ] Integrate lightweight SVG QR Code generator modal with download/copy functionality.
- [ ] Display aggregate analytics summary cards (total clicks, active links, 24h click volume).

### Phase 7: Deployment, Docker Compose, Backups & Cloudflare Ingress
- [ ] Author multi-stage `Dockerfile` (Node 20 Alpine, non-root user, memory-optimized flags).
- [ ] Author `docker-compose.yml` with host volume mount (`./data:/app/data`), resource caps (`mem_limit: 128m`), and health checks.
- [ ] Write non-blocking backup script (`scripts/backup.sh`) using SQLite `VACUUM INTO` with 7-day rotation.
- [ ] Write remote deployment script (`scripts/deploy-rv415.sh`) for `rv415` with pre-deploy backup and image rollback capability.
- [ ] Document Cloudflare Tunnel ingress rule configuration for `brzl.ca` pointing to `127.0.0.1:3005`.
- [ ] Update repository `README.md` with complete operational runbook.
