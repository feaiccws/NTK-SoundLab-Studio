# Project Operating Intelligence — NTK SoundLab Studio

> **Scope:** Project-specific operational standard for `NTK SoundLab Studio`. Complements the global NTK Operating Standard (`~/.gemini/config/AGENTS.md`).

---

## A. Project Identity
- **Project Name:** NTK SoundLab Studio (Short Name: `NTK SoundLab`)
- **Purpose:** Universal multi-platform media downloader, client-side video demuxer, Meta HTDemucs v4 2-stem/4-stem neural stem separator, 5-track synchronized audio mixing console, waveform trimmer, mastering FX, and 1080p karaoke visualizer video generator.
- **Primary Users:** Music producers, vocalists, remixers, karaoke creators, and digital media editors requiring zero-upload, 100% client-side privacy.
- **Current Phase:** Production & Release Distribution (v2026.11.3.1)
- **Latest Verified Milestone:** Multi-target builds verified (Windows Portable, Windows Setup Installer, Linux AppImage, Linux .deb, Android APK, Web PWA, AlwaysData package) and live deployment on Firebase Hosting.
- **Authoritative Source References:** `README.md`, `SOFTWARE/README-LATEST.md`, `DEPLOY_MANUAL/ALWAYSDATA_DEPLOYMENT.md`.

---

## B. Verified Technology Stack
- **Frontend / PWA:** Vanilla modern JavaScript (ES6+), Web Audio API, Web Workers, IndexedDB (v2 vault), lamejs (MP3 320kbps), HTML5 Canvas visualizer.
- **Backend / API:** Laravel 11 (PHP 8.2+), Python 3.12 (yt-dlp, PyTorch Meta HTDemucs v4).
- **Desktop Runtime:** Go 1.22+ launcher with Windows and Linux native webview runners, Inno Setup 6 installer compiler.
- **Mobile Target:** Android Studio Native Shell (Java/WebView), Android SDK 34 / build-tools 34.0.0, APK signing v1/v2/v3 (RSA-3072).
- **Packaging:** AppImageKit (`appimagetool`), `dpkg-deb` (WSL Ubuntu-26.04), Inno Setup (`ISCC.exe`).
- **Hosting / Distribution:** Firebase Hosting (Spark $0 plan), AlwaysData PHP hosting, GitHub Releases / Repositories.

---

## C. Development Environment
- **Selected Environment:** Hybrid Native Windows + WSL (Ubuntu-26.04) for Linux builds.
- **Rationale:** Native Windows delivers fastest Go compilation and Inno Setup execution; WSL provides native `dpkg-deb` and `appimagetool` packaging without overhead.
- **Verified Daily Commands:**
  ```bash
  # Go Desktop Test & Build
  cd desktop
  go test ./...
  go build -ldflags "-s -w -H windowsgui" -o ../dist/NTKSoundLab-Portable.exe .

  # Windows Installer (Inno Setup)
  "C:\Users\NTK\AppData\Local\Programs\Inno Setup 6\ISCC.exe" desktop/installer.iss

  # Linux Packaging (WSL)
  wsl --exec bash -c "cd /mnt/c/Users/NTK/Projects/NTK\ Projects/NTKStreamStudio/desktop/linux && ./package-linux.sh"

  # Android APK Build
  cd android
  powershell -ExecutionPolicy Bypass -File build.ps1

  # Firebase Deploy
  cd working
  firebase deploy --only hosting
  ```

---

## D. Architecture & Core Policy
- **100% Client-Side Privacy:** Audio demuxing, waveform processing, FX mastering, and video rendering happen entirely within the user's browser or desktop environment.
- **Smart PWA Detection:** PWA install action is only presented when running inside a web browser; suppressed in Desktop and Android builds.
- **Free-First Budget:** $0 budget strictly maintained across all builds, tools, and hosting.
