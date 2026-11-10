# NTK SoundLab Studio • Universal Media & Neural Stem Separator

[![Release](https://img.shields.io/badge/Release-2026.11.3.1-blue.svg)](SOFTWARE/SHA256SUMS.txt)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20Android%20%7C%20Web-purple.svg)](#downloads--distributions)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Client--Side-brightgreen.svg)](#privacy--architecture)

**NTK SoundLab Studio** (formerly NTK OmniStream Studio) is an all-in-one universal media workstation, client-side video demuxer, Meta HTDemucs v4 neural stem separator, 5-track audio mixing console, waveform mastering studio, and 1080p karaoke visualizer.

---

## Live Web App & Deployments

- **Production Live PWA**: [https://studio-5090403114-fc98b.web.app](https://studio-5090403114-fc98b.web.app)
- **AlwaysData Deployment Package**: Located in [`DEPLOY_MANUAL/NTK_SoundLab_Studio_AlwaysData.zip`](DEPLOY_MANUAL/NTK_SoundLab_Studio_AlwaysData.zip) (see [`DEPLOY_MANUAL/ALWAYSDATA_DEPLOYMENT.md`](DEPLOY_MANUAL/ALWAYSDATA_DEPLOYMENT.md) for full instructions).

---

## Downloads & Distributions

All software binaries are built, verified, and checksum-validated in the [`SOFTWARE/`](SOFTWARE/) directory:

| Platform | Format | File | SHA-256 Checksum |
| :--- | :--- | :--- | :--- |
| **Windows** | Setup Installer | [`SOFTWARE/INSTALLERS/WINDOWS/NTKSoundLab-Setup.exe`](SOFTWARE/INSTALLERS/WINDOWS/NTKSoundLab-Setup.exe) | `26938a9e22300b95d90ee2b638c4c34cb3c4f7fa32bf1fc453531bfeea091d31` |
| **Windows** | Portable EXE | [`SOFTWARE/PORTABLE/WINDOWS/NTKSoundLab-Portable.exe`](SOFTWARE/PORTABLE/WINDOWS/NTKSoundLab-Portable.exe) | `52ca5a74e27f6dd2b44249a5155fbe906cb581f185f40398bb9b1f28b74ddbc6` |
| **Linux** | AppImage (x86_64) | [`SOFTWARE/LINUX/NTKSoundLab-2026.11.3.1-x86_64.AppImage`](SOFTWARE/LINUX/NTKSoundLab-2026.11.3.1-x86_64.AppImage) | `61f6e2467d0cf0c4fb68d90ca1e9cb14c4c23db2e6eebff3c9657f9c2bfb9ce4` |
| **Linux** | Debian (`.deb`) | [`SOFTWARE/LINUX/ntk-soundlab_2026.11.3.1-1_amd64.deb`](SOFTWARE/LINUX/ntk-soundlab_2026.11.3.1-1_amd64.deb) | `86803e1e626df0f8eb86a60db56d47f9ff90ef340da9fe1eb9feea11306c5478` |
| **Android** | Native APK | [`SOFTWARE/ANDROID/NTKSoundLab-2026.11.3.1-android.2.apk`](SOFTWARE/ANDROID/NTKSoundLab-2026.11.3.1-android.2.apk) | `1ef982a727d216503c0a520bf2db7159f81da67c30a59f9393ff7ef21a24d9c4` |
| **Web** | Static PWA Bundle | [`SOFTWARE/WEB/NTKSoundLab-Static-2026.11.3.1.zip`](SOFTWARE/WEB/NTKSoundLab-Static-2026.11.3.1.zip) | `4fbe29fefc5f2122616f73ba93f3554471936c3e98197171e2efc75ff32c918c` |

Full checksum catalog available at [`SOFTWARE/SHA256SUMS.txt`](SOFTWARE/SHA256SUMS.txt).

---

## Key Features

1. **Neural Stem Separation (Meta HTDemucs v4)**:
   - **2-Stem Separation**: Vocal Acapella and Instrumental backing track with zero vocal bleed.
   - **4-Stem Demixing**: Discrete separation of Vocals, Drums, Bass, and Other Melodies.
   - **Dual Architecture**: Native hardware-accelerated PyTorch helper or zero-install WebGPU / ONNX in-browser runtime.

2. **5-Track Audio Mixing Console**:
   - Sample-synchronized multitrack playback.
   - Individual track Solo (`S`), Mute (`M`), volume faders (`0%` to `150%`), peak meters, and 1-click preset recipes.
   - Master custom mix bounce directly to 320kbps MP3 or studio WAV.

3. **In-Browser Video & Audio Demuxer**:
   - Pure client-side demuxing for `.mp4`, `.mov`, `.mkv`, `.webm`, `.mp3`, `.wav`, `.flac`, and `.m4a`.
   - Extracts high-resolution poster artwork frames and lossless audio streams.

4. **Waveform Trimmer & Mastering FX**:
   - Dual-handle waveform trimming with microsecond precision, customizable fade-in/out, and `-0.5 dBFS` peak normalization.
   - 6 Instant mastering FX presets: *Studio Master*, *Slowed + Reverb*, *Nightcore*, *808 Bass Boost*, *Lo-Fi Radio*, and *Clean*.

5. **1080p Karaoke Video Studio**:
   - High-definition video generator supporting `16:9` widescreen, `9:16` vertical (TikTok / Reels / Shorts), and `1:1` square.
   - Audio-reactive visualizer particle engines (*Frequency Bars*, *Neon Wave*, *Radial Ring*).
   - Synchronized lyric rendering with standalone `.LRC`, `.SRT`, and `.TXT` export.

6. **ID3v2.3 Tagging & Packaging**:
   - Client-side MP3 encoding at up to 320kbps with embedded cover artwork, title, artist, album, and synchronized lyrics.
   - 1-Click ZIP packaging of separated stems with metadata.

7. **Smart Environment Detection**:
   - Automatic PWA install button management: only shown in standard web browsers, hidden in native desktop, Windows installer, and Android APK builds.
   - Integrated **Novice Guide** interactive walkthrough built directly into the UI.

---

## Privacy & Architecture

NTK SoundLab Studio is built on a **Zero-Upload, 100% Client-Side Privacy** philosophy:
- Demuxing, waveform processing, audio mastering, and visualization run locally via the Web Audio API, Web Workers, and WebGPU.
- Your personal files never leave your machine during standard editing and playback.

---

## Repository Structure

```
NTKStreamStudio/
├── android/          # Native Android Studio project & APK build scripts
├── desktop/          # Go-based native desktop application & installer scripts
│   ├── installer.iss # Inno Setup 6 Windows installer script
│   └── linux/        # AppImage & Debian packaging scripts
├── laravel/          # Laravel 11 backend API & web endpoints
├── DEPLOY_MANUAL/    # Production deployment packages for AlwaysData / web servers
├── SOFTWARE/         # Official compiled binaries (Windows, Linux, Android, Web)
├── working/          # Primary static PWA web application & assets
├── .gitignore        # Monorepo ignore rules
└── README.md         # Master repository documentation
```

---

## Author & Credits

- **Product**: NTK SoundLab Studio (NTK Hub)
- **Author**: NTK Autonomous Engineering Standard
- **Powered by**: Meta HTDemucs v4, Web Audio API, Go, Inno Setup, Android SDK, and Laravel
