# NTK SoundLab Studio — NTK Hub

Current local release: **2026.11.3.1**, including dedicated Transcribe, Smart Install button visibility, and Novice Guide.

- Windows portable: `PORTABLE/WINDOWS/NTKSoundLab-Portable.exe` (also `OmniStreamStudio-Portable.exe`)
- Windows installer: `INSTALLERS/WINDOWS/OmniStreamStudio-Setup.exe`
- Android: `ANDROID/NTKSoundLab-2026.11.3.1-android.2.apk` (also `OmniStreamStudio-2026.11.3.1-android.2.apk`)
- Linux AppImage: `LINUX/OmniStreamStudio-2026.11.3.1-x86_64.AppImage`
- Debian: `LINUX/omnistream-studio_2026.11.3.1-1_amd64.deb`
- Static website: `WEB/NTKSoundLab-Static-2026.11.3.1.zip` (also `OmniStreamStudio-Static-2026.11.3.1.zip`)
- Laravel website: `../DEPLOY_MANUAL/NTK_OmniStream_Studio_AlwaysData.zip`

Open **Transcribe**, choose audio or video (both limits apply: **1 hour and 150 MB**),
set language or leave automatic detection, configure your own Groq key in AI Keys,
confirm your free-account billing/upload settings, then start. Recognition sends
audio to Groq; account quotas may interrupt long recordings. No paid fallback or
automatic retry is used. Keep the app open. Cancel retains completed sections;
Continue retries the unfinished section. After reopening, select the partial
transcript from history and choose the same file to continue.

Edit or copy the result, or download TXT (default), SRT or LRC. Timed exports retain
the original cue timings when you keep one text line per cue. Changing the line
count makes TXT the available download until cue line breaks are restored.
History, editing and downloads work locally/offline. Download important copies
before clearing app/browser data or uninstalling. History does not store source
recordings; storage is local to each installed app/browser and does not sync.

Speech and singing use original-language recognition. Language coverage and singing
accuracy vary. Translation and speaker labels are deferred. Some compressed codecs
depend on the device; the app checks decoding support and offers a WAV alternative.
Linux still requires an installed modern browser for its graphical app window.
Android retains its signing identity and native Files/Share integrations.

Verified locally with synthetic provider responses, actual one-hour WAV decoding,
MP3/MP4 input, desktop/mobile browser checks, Android emulator, Windows packaged
server, Linux AppImage/Debian payloads, native Android TXT save, and existing karaoke
regressions. Real provider recognition accuracy, physical-phone long recordings,
graphical Linux installation and Windows installer installation remain untested.
The web packages are prepared; no live website was deployed.

Hashes: `SHA256SUMS.txt`. Evidence and rollback details:
`../working/EVIDENCE/transcribe-2026-11-03/` and `../working/docs/handoff/`.
Older versioned releases are retained for rollback. MediaBunny 1.65.0 is bundled
under MPL-2.0 with its license and corresponding-source URL in `lib/mediabunny/`.
