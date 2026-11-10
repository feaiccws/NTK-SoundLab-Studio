# Hostinger Deployment Guide • NTK Hub Suno Studio (Laravel Edition)

This Laravel application provides a native, zero-CORS backend proxy and full browser studio suite for Suno AI audio and video generation.

---

## 1. Directory Structure on Hostinger

You can deploy using either of two methods:

### Method A (Recommended: Dedicated Subdomain or Domain Root)
1. In Hostinger hPanel, go to **Websites > Domains / Subdomains**.
2. Create your domain or subdomain (e.g. `suno.ntkhub.com`).
3. Set the **Target Directory / Document Root** to:
   `domains/suno.ntkhub.com/public` (or `laravel/public`).
4. Upload all files from the `laravel` directory into the domain root.

### Method B (Standard `public_html` with Included `.htaccess`)
1. Upload all files from the `laravel` folder directly into `public_html/`.
2. The included root `.htaccess` will automatically rewrite all incoming traffic to `public/` while securing your `.env` and system files.

---

## 2. Environment Configuration (`.env`)

In your Hostinger File Manager, create or edit `.env`:
```ini
APP_NAME="NTK Hub Suno Studio"
APP_ENV=production
APP_KEY=base64:YOUR_APP_KEY_HERE
APP_DEBUG=false
APP_TIMEZONE=UTC
APP_URL=https://your-domain.com

DB_CONNECTION=sqlite
# Or MySQL if configured on Hostinger:
# DB_CONNECTION=mysql
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_DATABASE=u123456_suno
# DB_USERNAME=u123456_user
# DB_PASSWORD=your_password
```

---

## 3. Storage Permissions

In Hostinger File Manager or SSH terminal, ensure the following folders have write permissions (`775` or `755`):
- `storage/`
- `storage/logs/`
- `storage/framework/`
- `bootstrap/cache/`
- `database/database.sqlite` (if using SQLite)

---

## 4. Verification

Once deployed, visit your domain:
- Main Studio: `https://your-domain.com/`
- Health Endpoint: `https://your-domain.com/api/health`
- Decryption Key Proxy: `POST https://your-domain.com/api/mango/rights`

The studio will run on iPhones, Android phones, tablets, and any computer with zero local server needed.
