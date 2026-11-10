# Continuation

## Latest continuation — Transcribe delivered locally

Start with SOFTWARE/README-LATEST.md, CURRENT_STATE.md's2026.11.3.1 section and
working/EVIDENCE/transcribe-2026-11-03/release-manifest.json. Dedicated Transcribe is
implemented and packaged across all four targets. Do not rebuild passed work unless
there is a new defect. Source files: js/transcribe-studio.js, transcribe-engine.js,
transcript-store.js; css/transcribe.css; native Android hooks and shared AiPolicy.

For recognition issues, capture file type, duration/size, codec capability, selected
language/model, section number and sanitized status. Never log a key or request body.
Real-provider accuracy remains untested. Use the in-app consent flow and user-chosen
audio/account, never synthetic results as acoustic proof. For resume issues preserve
partial history and original file, especially its file metadata. Validate after
refresh that selecting the same source resumes rather than starts over.

Root has finished editing; source remains uncommitted with existing changes. Resolve
one-writer ownership before resuming. Final QA used isolated profiles/emulator and
synthetic data; no real private audio/account was touched. All old rollback/profile
preservation constraints below still apply. No live deployment was requested.

Read CURRENT_STATE.md and the Android/Linux release manifests first. The latest
requested packages are delivered locally: native-feeling Android APK, Linux
AppImage and .deb. The repaired desktop/web lyric engine remains the shared source.
Avoid reopening passed work without a new failure. No store or live publication was requested.

For phone follow-up, start with `android/README.md`, `android/web/android.js`,
`android/src/com/ntkhub/omnistream/MainActivity.java` and Android VERIFICATION.md.
The signing key must be preserved outside source/packages. Never replace it casually
or ask for keys in chat. A physical phone check should use the release APK, a short
local song and Android Files/Share first. Real-provider singing recognition requires
the existing in-app upload/account confirmation; synthetic evidence is not accuracy proof.

For Linux follow-up, use `desktop/linux/build.ps1` and the package README. The
existing browser is a prerequisite. Automated WSL tests do not prove menu integration
or distro install/uninstall. Preserve the stable47831 origin and dedicated profile.

Start at `working/js/app.js` runAiAutoSync, `working/js/lyric-alignment.js`, `working/js/video-generator.js`, and `working/EVIDENCE/repair-2026-11-02/final-desktop/lyrics-results.json` if NTK reports a sync failure. Record provider status/error and whether the editor contains plain or timed lyrics. Do not request keys in chat or log them. A conservative transcript-matching rejection may be recognition mismatch rather than editor detection failure; preserve the user's text.

For a reported empty deck after upgrading, retain `%LOCALAPPDATA%\NTKOmniStreamStudio\profile`. Old random-port origins are not automatically visible at port 47831. Inspect only relevant app storage, use a reviewed export/import path and avoid destructive browser edits.

Source remains uncommitted with preexisting changes. Root is the current writer; resolve ownership before edits. Backend tests must use the isolated storage/in-memory database safeguards now in tests/TestCase.php and phpunit.xml. Never run pruning against real storage merely to test it.

All release paths and rollback locations are in CURRENT_STATE.md. The prior unsafe ZIP builder was replaced; use the new explicit --source/--output interface on an isolated production-vendor stage. Do not include `.env`, real SQLite, cookies or runtime storage. Live publication has not been requested or performed.
