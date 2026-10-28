# Prompt: Transform `url-shortnener` into a Production Web App for `brzl.ca`

> **Usage:** Copy and provide the prompt below to your AI coding agent (or Antigravity / Claude / Cursor) within this repository to execute the complete transformation.

---

```markdown
# TASK: Build and Deploy the `brzl.ca` URL Shortener Web App

You are tasked with building a high-performance, resource-efficient, production-grade URL shortener web application for custom domain **`brzl.ca`**, self-hosted on a home server (**`rv415`**) and routed securely through **Cloudflare Tunnel**.

---

## 1. Context & Server Environment

- **Domain:** `brzl.ca`
- **Hosting Target:** `rv415` (192.168.2.29 / Ubuntu 24.04 LTS / AMD E-300 2-core 1.3GHz APU / 6GB RAM).
- **Resource Constraints:** AMD E-300 is a lightweight, low-power dual-core CPU with a spinning SATA HDD. The application **must be ultra-lightweight**, have minimal memory footprint (< 50MB RAM at runtime), fast cold-starts, and avoid heavy CPU workloads or bloated runtimes.
- **Network Ingress:** Cloudflare Tunnel (`cloudflared` is already running on `rv415` in Docker host network mode, Tunnel ID: `8315d281-8528-4dcf-95f7-285c7256c74c`). The app will listen on a dedicated host port (e.g., `127.0.0.1:3005`) and Cloudflare will route `brzl.ca` to this port with Zero Trust / SSL termination.
- **Initial State:** Start with an empty links database. Links will be created through the admin dashboard or API.

---

## 2. Technical Stack Recommendation

Choose a stack that is lightning-fast, zero-hassle to deploy, and consumes minimal RAM:

- **Backend & Server:** Node.js (v20+ LTS) with **Fastify** or **Hono** (or Bun/Go if preferred; Fastify + TypeScript is recommended for maintainability and speed).
- **Database:** **SQLite** via `better-sqlite3` (or `sql.js` / `bun:sqlite`) running with:
  - `PRAGMA journal_mode = WAL;` (prevents database locking)
  - `PRAGMA synchronous = NORMAL;` (dramatically reduces disk I/O on HDD)
  - Single database file in a persistent Docker volume (`./data/shortener.db`).
- **Frontend / Dashboard:** Single-page dashboard built with modern Tailwind CSS + Vanilla JS or a lightweight Vite/React build served as static assets from the same backend binary/container.
- **Authentication:**
  - Support Cloudflare Access header (`Cf-Access-Authenticated-User-Email`) for seamless SSO if configured.
  - Fallback / local auth: Simple Admin Secret Key (`ADMIN_API_KEY` / Session Cookie or Bearer Token).
- **Containerization:** Docker multi-stage build (Alpine or slim base) + `docker-compose.yml`.

---

## 3. Core Functional Requirements

### 3.1. High-Performance Redirect Engine
- Route `GET /:slug` directly to the target URL using `307 Temporary Redirect` (or configurable `301 Permanent Redirect`).
- Reserved routes: Ensure system paths are reserved and cannot be used as slugs:
  - `/admin`, `/api/*`, `/health`, `/favicon.ico`, `/robots.txt`, `/static/*`.
- 404 / Fallback Handling:
  - Return a branded, minimal 404 page for unknown or disabled slugs. Support an optional operator-configured fallback URL only if explicitly enabled.
- Non-blocking Click Analytics:
  - On each redirect, asynchronously record:
    - Timestamp
    - Slug ID
    - Referrer (from `Referer` header)
    - IP Country (read from Cloudflare header `CF-IPCountry`)
    - User Agent (parsed or truncated device/browser info)
  - Update `click_count` and `last_accessed_at` on the link record.

### 3.2. Link Management API (`/api/links`)
Protected by `Authorization: Bearer <ADMIN_API_KEY>` or authenticated session:
- `GET /api/links`: List all links with pagination, search, and click counts.
- `POST /api/links`: Create a new short link:
  - Fields: `url` (required), `slug` (optional, auto-generate 5-character nanoid/alphanumeric if omitted), `description` (optional), `is_active` (boolean, default true).
- `GET /api/links/:id`: Retrieve link details and recent click history.
- `PUT /api/links/:id`: Update destination `url`, `slug`, `description`, or toggle `is_active`.
- `DELETE /api/links/:id`: Delete a short link (soft or hard delete).
- `GET /api/stats`: Quick dashboard summary (total links, total clicks, top 5 popular links, clicks last 24h/7d).
- `GET /health`: Unauthenticated health probe (`{"status": "ok", "uptime": ...}`).

### 3.3. Admin Web Dashboard (`/admin`)
- Accessible via `/admin` (desktop and mobile responsive).
- Clean, minimalist aesthetic (dark mode default with high contrast, crisp typography).
- Features:
  - **Quick Add Bar:** Destination URL input + optional custom slug + "Shorten" button.
  - **Links Table / Card List:**
    - Short URL with 1-click "Copy" button (`brzl.ca/<slug>`).
    - Target URL preview with truncation.
    - Click count badge.
    - Status toggle (Active / Disabled).
    - QR Code modal (instantly render QR code SVG for offline or mobile sharing).
    - Edit and Delete actions.
  - **Search & Filter:** Instant filter by slug, destination URL, or description.
  - **Quick Analytics:** Clicks count, creation date, last clicked date.

---

## 4. Architecture & Database Schema

### Database Tables (SQLite)

```sql
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
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

---

## 5. File Structure to Generate

```
.
├── src/
│   ├── index.ts               # Server entry point & graceful shutdown
│   ├── config.ts              # Env configuration & defaults
│   ├── db/
│   │   ├── index.ts           # SQLite connection & WAL pragmas
│   │   ├── schema.sql         # SQL schema definitions
│   ├── routes/
│   │   ├── redirect.ts        # Fast /:slug redirection & click logging
│   │   ├── api.ts             # CRUD & stats REST API
│   │   └── health.ts          # /health probe
│   ├── middleware/
│   │   └── auth.ts            # Admin API key / CF Access auth check
│   └── public/                # Admin frontend assets (HTML, CSS, JS)
│       ├── index.html
│       ├── app.js
│       └── styles.css
├── data/                      # Persistent storage (SQLite DB mount)
├── scripts/
│   └── deploy-rv415.sh        # Deployment script for remote rv415 host
├── Dockerfile                 # Multi-stage lightweight build
├── docker-compose.yml         # Container & volume orchestration
├── package.json
├── tsconfig.json
└── README.md                  # Comprehensive setup & operations doc
```

---

## 6. Cloudflare Tunnel & rv415 Deployment Specification

### 6.1. Docker Compose Configuration (`docker-compose.yml`)
```yaml
version: '3.8'

services:
  url-shortener:
    build: .
    image: brzl-shortener:latest
    container_name: brzl-shortener
    restart: unless-stopped
    ports:
      - "127.0.0.1:3005:3005"
    environment:
      - PORT=3005
      - BASE_URL=https://brzl.ca
      - ADMIN_API_KEY=${ADMIN_API_KEY}
      - DB_PATH=/app/data/shortener.db
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3005/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### 6.2. Cloudflare Ingress Rule
On `rv415`, Cloudflare Tunnel (`8315d281-8528-4dcf-95f7-285c7256c74c`) route:
- Hostname: `brzl.ca`
- Service: `http://127.0.0.1:3005`
- Additional origin headers: Pass through `CF-Connecting-IP`, `CF-IPCountry`.

Provide the exact curl command to patch the Cloudflare Tunnel ingress configuration rule via API.

---

## 7. Deliverables & Execution Plan

Please implement this project completely following these steps:

1. **Setup project configuration:** Initialize `package.json`, TypeScript, and build scripts.
2. **Implement Database Layer:** Setup SQLite with WAL mode and automatic schema creation. Start with an empty links table; links are added through the dashboard or API.
3. **Build Core Server & Redirection Engine:**
   - Ultra-fast `/:slug` handler with non-blocking click tracking.
   - Reserved route guards and 404/fallback redirection.
4. **Build Admin REST API:**
   - Full CRUD endpoints protected with API key authentication.
   - Aggregate statistics endpoint.
5. **Build Dashboard UI:**
   - Responsive web dashboard served at `/admin`.
   - Link creation, QR code generation, copy to clipboard, and click counters.
6. **Docker & Deployment Automation:**
   - Create multi-stage `Dockerfile` (optimized for linux/amd64).
   - Create `docker-compose.yml` with persistent SQLite volume.
   - Create automated `deploy-rv415.sh` script to build, deploy to `rv415` via SSH, and apply database schema changes safely.
   - Update `README.md` with instructions on running locally, deploying to `rv415`, and configuring Cloudflare DNS & Tunnel.
7. **Verification:**
   - Run tests or dry-run scripts to verify link creation and redirection, API authentication, slug generation, database persistence across restarts, and health checks.

Begin step-by-step, ensuring clean code, clear comments, and robust error handling throughout.
```
