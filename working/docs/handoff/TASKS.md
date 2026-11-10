# Remaining verification

## Dedicated Transcribe closure — 2026.11.3.1

- [x] Implement1hour/150MB limits, bounded audio/video decoding and online recognition.
- [x] Add consent, cancellation, explicit retry/partial retention and storage failures.
- [x] Add editable local history, Copy/TXT/SRT/LRC and Android native navigation/export.
- [x] Verify synthetic one-hour flow, WAV/MP3/MP4, offline history, mobile layout and karaoke regressions.
- [x] Package and verify web, Windows, Android, Linux AppImage and Debian parity/runtime.
- [ ] Real-provider speech/singing acceptance with NTK's chosen file/account via in-app consent.
- [ ] Physical-phone long recordings and native graphical installer checks below.

- [x] Build the Android APK with native mobile navigation, document import/save/share and phone editor layout.
- [x] Verify Android first-launch offline, native file flows, persistent lyrics and a real short video on an emulator.
- [x] Build Linux AppImage and .deb; run11 native test groups and25 Linux-browser checks per final package.
- [ ] Test on NTK's physical Android phone, including long renders, device fonts/keyboard and thermal/memory behavior.
- [ ] Test Linux graphical launcher/menu, actual .deb install/uninstall and FUSE-mounted AppImage on a desktop distro.

- [x] Repair current-editor detection, word matching, persistence, playback/render and subtitle use.
- [x] Exercise rejection, quota failure, edit races, cancellation and offline storage.
- [x] Integrate and build desktop and web source copies; preserve rollback.
- [x] Fix discovered backend URL/TLS/cookie/download/prune/package defects and run isolated regressions.
- [ ] Verify actual singing recognition with NTK's chosen track and eligible free provider account, after the in-app upload confirmation. Do not claim synthetic timestamps prove acoustic accuracy.
- [ ] Verify interactive Edge window and installer install/uninstall in a disposable Windows account/VM.
- [ ] Recover any old random-port deck only if needed, preserving its browser profile.
- [ ] Verify optional neural separation runtime/model, including offline startup, on target hardware.
- [ ] Deploy only when explicitly authorized, then verify the real web URL and account/hosting limits.

No claim of universal bug freedom or production completion follows from these checks.
Android emulator and Linux WSL/headless-browser execution are verified; the specific
physical-device/desktop integration limits above remain.
