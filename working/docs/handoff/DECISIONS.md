# Repair decisions — 2026.11.3

## Transcribe decisions — 3 November 2026

- User raised limits to1hour AND150MB; enforce both before upload.
- Reuse shared browser engine and existing native shells. Groq Whisper initially;
  automatic/manual original-language recognition, speech and singing; speakers and
  translation later. Offline editing/history/export; recognition online.
- Bundle pinned MPL2.0 MediaBunny with source/license notice. Stream decode bounded
  windows; never fully decode hour-long source into AudioBuffer. Device codecs vary.
- Persist transcript rows separately from clearable audio cache. Store no source
  audio/key in rows. Explicit retry resumes completed windows; no automatic replay.
- Preserve text edits. Timed exports require one line per original timed cue.
- Root remained sole active source writer; delegated read-only architecture/package
  reviews returned useful findings, then hit service usage limits. No agent edited source.
- Local packaging only. No deployed site, account change, billing or real-audio upload.

- Keep the approved browser/Go/Laravel stack and the existing design. Root alone integrates active source; collaborators use isolated folders.
- The current editor is authoritative. Do not replace supplied lyrics with a transcription or manufacture evenly spaced AI timestamps. Reject uncertain matching while preserving user work.
- Use cloud AI only through explicit user action and upload confirmation, with Free Only routes and Paid Backup Off. The client cannot establish a provider account's billing state.
- Prefer actual cached vocal stems for alignment but retain the original song clock. Render word timing only when metadata matches the exact text and audio duration.
- Use a fixed native origin for durable browser storage. Retain older profiles; do not silently migrate browser databases.
- Report unsupported native conversion accurately. Hosted extraction requires an operator-enforced network sandbox; installing an extractor binary alone is insufficient.
- Separate source repair/package preparation from live deployment. No cloud or account mutation is authorized by this repair.
- Preserve existing runtime data and rollback copies; distribute only allowlisted source/assets and production dependencies. Do not include the old secret-bearing runtime in a new web package.
# Android and Linux packaging decisions — 3 November 2026

- Reuse the current JavaScript studio/media engine. Android adds a native Java
  shell and Android-only presentation; desktop/web engine assets stay identical.
- Native Android storage/document/share APIs avoid broad storage permissions.
  Exact-origin main-frame MessagePort, blocked remote frames, no generic native
  proxy and no unrestricted JavaScript interface. Offline app assets are bundled.
- Android video defaults720p/30fps; platform codecs decide the real exported format.
  Stop/cancel on background, retain export for user Save/Share, never pretend a
  failed/cancelled Files save succeeded. Android build signs locally outside source.
- Preserve Go desktop architecture. Linux packages use a system Chromium-family
  browser, stable loopback origin and dedicated local profile; unsupported server
  conversions retain the existing honest capability errors.
- No store publication, cloud deployment, spending or account changes. Physical
  device acceptance and actual provider recognition remain distinct from package QA.

