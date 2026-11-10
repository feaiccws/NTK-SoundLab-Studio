# NTK SoundLab Studio — AlwaysData & Production Web Deployment Manual

**Prepared for NTK · NTK Hub · Release 2026.11.3.1**

This folder contains the verified, production-ready Laravel 11/PHP 8.4 application packages with all assets, matching Blade views, and production-only dependencies:
* `NTK_SoundLab_Studio_AlwaysData.zip` (Primary)
* `NTK_OmniStream_Studio_AlwaysData.zip` (Legacy compatibility)

Both archives deliberately exclude `.env`, application keys, debug caches, test suites, private storage, and development dependencies.

---

## 1. Environment Requirements

* **PHP Version:** PHP **8.4.1 or newer compatible version** with extensions: `curl`, `openssl`, `pdo_sqlite` (or `pdo_mysql`), `mbstring`, `fileinfo`, `zip`.
* **HTTPS & SSL:** Valid CA certificate store for outbound HTTPS requests.
* **Document Root:** The web server / virtual host document root **must** point to the application's `/public` subfolder.
* **Permissions:** Writable `storage/` and `bootstrap/cache/` directories owned by your web user.
* **Optional CLI Tools:** `ffmpeg` on the server PATH if enabling server-side direct media transcoding. (Client-side in-browser Web Audio demuxing and editing work without server FFmpeg).

---

## 2. Deployment Instructions (AlwaysData / Shared / VPS)

### Step 1: Upload and Extract
Upload `NTK_SoundLab_Studio_AlwaysData.zip` to your application directory (e.g. `/home/username/soundlab`) and extract it:
```bash
unzip -q NTK_SoundLab_Studio_AlwaysData.zip -d /home/username/soundlab
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cd /home/username/soundlab
cp .env.example .env
```
Edit `.env` to set your actual production domain and environment:
```ini
APP_NAME="NTK SoundLab Studio"
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://your-account.alwaysdata.net
```

### Step 3: Generate Application Key
```bash
php artisan key:generate
```

### Step 4: Database Setup (SQLite Default)
If using SQLite:
```bash
touch database/database.sqlite
php artisan migrate --force
```

### Step 5: Web Server Routing
Configure the AlwaysData site:
* **Type:** PHP
* **PHP Version:** 8.4
* **Root Directory:** `/home/username/soundlab/public`

### Step 6: Verify Health Endpoints
Open your browser and verify:
* `https://your-account.alwaysdata.net/` — Loads NTK SoundLab Studio interface.
* `https://your-account.alwaysdata.net/api/health` — Returns JSON status `{"status": "ok"}`.

---

## 3. Automated Storage Pruning

The backend automatically manages temporary audio/video processing files. Schedule Laravel's prune command via AlwaysData Scheduled Tasks or cron:
```bash
php /home/username/soundlab/artisan omni:prune --max-age=30
```
Schedule it to run every 30 minutes to ensure disk usage remains within your hosting plan limits.

---

## 4. Verification & Security Checkpoints

* **Privacy Guaranteed:** All neural stem separation (Meta HTDemucs v4), waveform editing, and 1080p video rendering are processed entirely client-side in the browser.
* **Egress Safety:** Arbitrary extraction is disabled unless `MEDIA_EXTRACTOR_EGRESS_SANDBOXED=true` is explicitly set in `.env`.
* **Zero Secret Leakage:** No database files, cookies, or secrets are bundled in the package.
