# `brzl.ca` URL Shortener Web App

A high-performance, low-memory, production-grade URL shortener web application custom-built for domain **`brzl.ca`**, self-hosted on home server **`rv415`** and routed securely through **Cloudflare Tunnel**.

---

## 🌟 Key Features

- **Ultra-Fast Redirections:** `GET /:slug` redirects with `307 Temporary Redirect` in sub-millisecond response times.
- **Strict HTTP Caching:** Sends explicit `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` so destination edits and link deactivations take effect immediately.
- **Clean HTTP Semantics:**
  - `GET /`: `302 Found` redirects to `DEFAULT_FALLBACK_URL` (`https://brasileiro.ca`).
  - Unknown slug: Returns branded `404 Not Found` HTML page (no silent redirects).
  - Deactivated slug: Returns branded `410 Gone` HTML page.
- **Decoupled Non-Blocking Analytics:**
  - Zero DB write latency during redirects.
  - In-memory batch queue buffers events and commits in a single transaction every 50 events or 1,000 ms.
  - Graceful shutdown drains queue on `SIGTERM`/`SIGINT`.
  - Privacy compliant: logs `CF-IPCountry`, strips sensitive query strings from `Referer`, truncates `User-Agent`.
  - Automatic daily 90-day retention pruning.
- **Admin Web Dashboard (`/admin`):**
  - Dark-mode responsive UI.
  - Quick shorten form with custom slug option.
  - Links table with debounce search, 1-click clipboard copy (`brzl.ca/<slug>`), and active status toggle.
  - Embedded SVG QR Code generator modal with download and copy.
  - Real-time aggregate analytics counters.
- **Full REST API:**
  - `/api/links` (CRUD, pagination, collision checks, nanoid generation with retry).
  - `/api/stats` (overview metrics and top links).
  - `/health` (system and database integrity liveness check).
  - Authentication via `Authorization: Bearer <ADMIN_API_KEY>` or Cloudflare Zero Trust Access.
- **Resource Efficient:**
  - Runs in a lightweight Node 20 Alpine container with `< 60MB` RSS memory footprint.
  - Tuned with SQLite WAL mode and `synchronous = NORMAL` for low I/O on `rv415`'s SATA HDD.

---

## 🚀 Local Development

```bash
# Install dependencies
npm install

# Run database migrations and seed legacy _redirects
npm run seed

# Start development server with live reload
npm run dev

# Or build and start production bundle
npm run build
npm start
```

Default local address: `http://localhost:3005` (Admin dashboard at `http://localhost:3005/admin`).

---

## 🐳 Docker Deployment on `rv415`

### 1. Remote Deployment Script
Run the automated deployment script from your development machine:
```bash
./scripts/deploy-rv415.sh
```
This script will:
1. Sync repository files to `rv415:/home/ds/projects/url-shortnener`.
2. Take an automated pre-deployment snapshot of `./data/shortener.db`.
3. Build and launch the container with `docker compose up -d --build`.
4. Wait for and verify the container health check.

### 2. Manual Docker Compose Run on `rv415`
```bash
cd /home/ds/projects/url-shortnener
docker compose up -d --build
```

---

## 🌐 Cloudflare Tunnel Ingress

The application binds locally to port `3005` on `rv415`. Cloudflare Tunnel routes public traffic for `brzl.ca` to this container.

To configure or update the Cloudflare Tunnel ingress rule:
```bash
./scripts/configure-cloudflare.sh
```

---

## 💾 Backups & Disaster Recovery

### Creating a Snapshot Backup
The application includes an online, non-blocking backup script using SQLite `VACUUM INTO`:
```bash
./scripts/backup.sh
```
Backups are saved to `./data/backups/shortener_backup_<timestamp>.db` with automated 7-day retention pruning.

### Restoring from Backup
```bash
# 1. Stop container
docker compose down

# 2. Restore selected snapshot
cp ./data/backups/shortener_backup_YYYYMMDD_HHMMSS.db ./data/shortener.db

# 3. Verify integrity
sqlite3 ./data/shortener.db "PRAGMA integrity_check;"

# 4. Restart container
docker compose up -d
```
