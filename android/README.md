# OmniStream Studio for Android

NTK Hub · 2026.11.3.1-android.2 · Android 10 or later

This APK uses a native Android activity, navigation, dialogs, document pickers,
Back handling and share sheet around the shared local studio engine. Audio,
lyrics and video processing run in Android System WebView. Keep WebView updated.
It is a hybrid Android application; it does not require a hosted website.

## Install and use

Copy the release APK from `SOFTWARE/ANDROID` to the phone and open it in Files.
Android may ask you to allow installation from that particular Files/browser
app. The APK is locally signed by NTK Hub and is not a Play Store release.

- **Import audio or video** on Library opens Android Files; multiple files are supported.
- **Transcribe** opens dedicated transcription, local history and TXT/SRT/LRC downloads.
- **Library** keeps imported tracks on this device. Open a track's tools or select
  **Karaoke** to choose a song, add lyrics and create its video.
- **Tools** contains storage, optional AI keys, session import/export and help.
- Exported files first show **Save a copy to Files** and **Share with another app**.
  A cancelled save leaves the generated file available under Tools for this session.
  Temporary exports older than 24 hours are removed on a later launch; save important copies.
- Back closes the active editor/fullscreen view before asking to close the app.
  Keep the studio visible while rendering. Backgrounding pauses playback and
  cancels a running render instead of delivering an incomplete file.

The initial mobile video preset is 720p/30fps. Lower it to 480p for slower phones.
Available formats depend on the installed WebView: the tested WebView 124 exports
WebM with VP9/Opus. Do not rename WebM to MP4. Export transfers are bounded at 512 MB;
large media/stem jobs also depend on device memory and storage.

## Offline, privacy and limits

Bundled importing, editing, playback, tap-to-sync, subtitles and supported exports
open on first launch offline. AI recognition, remote media and neural-model
downloads need internet. AI remains optional and requires the existing explicit
free-account/upload confirmation. Actual sung-audio recognition accuracy has not
been tested in this release. Desktop Python helpers, server extraction/conversion
and first-launch neural models are not included.

No microphone, camera, broad-storage or contact permissions are requested. A
stable HTTPS asset origin provides local IndexedDB/storage. Native access uses a
main-frame message port targeted to that exact origin; remote frames are blocked.
Remote navigation opens the system browser only after a user gesture. No general
native proxy, arbitrary file-path bridge or unrestricted JavaScript interface exists.

Provider keys and local projects are app data, not separately encrypted by this
application. Android backup is disabled. Uninstalling or clearing app data removes
them. Export media before doing either; session JSON contains metadata, not audio.
Updates with the same signing key/application ID retain app data.

## Build and signing

Run `powershell -File android/build.ps1` from the workspace, or pass `-DebugBuild`
for emulator QA. The builder uses the installed JDK 21, Android platform 36.1,
build-tools 36.1.0, Python and Windows DPAPI. It does not use Gradle or download
dependencies. The canonical desktop allowlist selects 42 shared frontend assets;
only the staged Android entry page gets Android CSS/JS and offline font changes.

Release debugging is disabled. The private signing key lives outside this project
under `%LOCALAPPDATA%\NTKOmniStreamStudio\android-signing`, with its password
protected for this Windows account by DPAPI. Never include that directory in a
release/handoff. Preserve it privately for future updates; do not regenerate a key
to update an existing installation. Signing identity is not Play Store verification.

Actual test scope and screenshots are recorded under
`working/EVIDENCE/android-2026-11-03`. Physical-phone performance, long renders,
real AI-provider recognition and human listening remain separate acceptance work.
