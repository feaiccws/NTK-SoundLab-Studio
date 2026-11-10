import { TranscribeStudio } from './transcribe-studio.js?v=2026.11.3.1';
import { AiPolicy } from './ai-policy.js?v=2026.11.3.1';
import { LyricAlignment } from './lyric-alignment.js?v=2026.11.3.1';
import { fetch } from './network-policy.js?v=2026.11.3.1';
/**
 * NTK SoundLab Studio - Universal Media Downloader & Neural Stem Separator
 * Main Application Orchestrator
 */

import { OmniAPI } from './omni-api.js?v=2026.11.3.1';
import { VideoDemuxer } from './video-demuxer.js?v=2026.11.3.1';
import { SunoAPI } from './suno-api.js?v=2026.11.3.1';
import { CryptoEngine } from './crypto-engine.js?v=2026.11.3.1';
import { AudioConverter } from './audio-converter.js?v=2026.11.3.1';
import { Mp3Encoder } from './mp3-encoder.js?v=2026.11.3.1';
import { ID3Writer } from './id3-writer.js?v=2026.11.3.1';
import { LyricsUtils } from './lyrics-utils.js?v=2026.11.3.1';
import { VaultDB } from './vault-db.js?v=2026.11.3.1';
import { StemEngine } from './stem-engine.js?v=2026.11.3.1';
import { StemMixer } from './stem-mixer.js?v=2026.11.3.1';
import { AudioFXEngine } from './audio-fx.js?v=2026.11.3.1';
import { ZipPackager } from './zip-packager.js?v=2026.11.3.1';
import { VideoGenerator } from './video-generator.js?v=2026.11.3.1';
import { BookmarkletEngine } from './bookmarklet.js?v=2026.11.3.1';
import { StorageManager } from './storage.js?v=2026.11.3.1';
import { PlayerEngine } from './player.js?v=2026.11.3.1';
import { TutorialManager } from './tutorial.js?v=2026.11.3.1';
import { ImageCropper } from './image-cropper.js?v=2026.11.3.1';

class App {
  constructor() {
    this.player = new PlayerEngine();
    this.stemMixer = new StemMixer((tick) => this.onStemMixerTick(tick));
    this.imageCropper = new ImageCropper();
    this.pendingUncroppedImage = null;
    this.videoStudio = null;
    this.tutorial = null;

    this.isLocalProxyActive = false;
    this.isAudioOnlyGrab = false;
    this.helperStatus = { active: false, ytdl: false, ffmpeg: false, demucs: {} };
    this.localDemucsCaps = { available: false, device: 'cpu', engine: 'none' };

    this.activeStudioSong = null;
    this.activeStemsSong = null;
    this.activeTrimSong = null;

    this.trimState = {
      duration: 0,
      startSec: 0,
      endSec: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      preset: 'clean',
      peaks: null,
      audioBuffer: null
    };
    this.fxPreviewSource = null;

    this.vaultSummary = {
      masterIds: new Set(),
      stemIds: new Set(),
      hasOnnxModel: false
    };

    this.deferredInstallPrompt = null;
  }

  async init() {
    this.transcribe = new TranscribeStudio(this);
    this.setupUIBindings();
    this.setupBookmarklet();
    this.setupDropzone();
    this.setupTrimCanvasInteractions();
    this.setupPwa();
    this.tutorial = new TutorialManager(this);

    await Promise.all([
      this.checkProxyStatus(),
      this.refreshVaultSummary(false)
    ]);

    this.renderSongs();
    await this.handleDeepLinkParams();

    setInterval(() => this.checkProxyStatus(), 15000);

    // Keep desktop native wrapper active while window is open
    fetch('/api/desktop/heartbeat', { method: 'POST' }).catch(() => {});
    setInterval(() => {
      fetch('/api/desktop/heartbeat', { method: 'POST' }).catch(() => {});
    }, 4000);

    // Desktop lifecycle follows heartbeats; reload/navigation must not stop the service.

  }

  /**
   * Smart Clipboard Grab: Reads system clipboard, extracts all Suno URLs / short links / UUIDs, and resolves them
   */
  async pasteAndResolveClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      this.showToast('Clipboard read requires user paste (press Ctrl+V into the URL box).', 'amber');
      document.getElementById('songUrlInput')?.focus();
      return;
    }

    try {
      const clipText = (await navigator.clipboard.readText()).trim();
      if (!clipText) {
        this.showToast('Your clipboard is empty. Copy a Suno song link first!', 'amber');
        return;
      }

      const uuids = SunoAPI.extractUuids(clipText);
      const inputArea = document.getElementById('songUrlInput');

      if (uuids.length === 0) {
        if (inputArea) {
          inputArea.value = clipText;
          inputArea.focus();
        }
        this.showToast('Pasted clipboard text, but no Suno song UUID was detected.', 'amber');
        return;
      }

      if (inputArea) inputArea.value = clipText;
      await this.handleSongInput();
    } catch (err) {
      this.showToast('Allow clipboard permission or press Ctrl+V inside the URL box.', 'amber');
      document.getElementById('songUrlInput')?.focus();
    }
  }

  /**
   * Exports current Studio Deck metadata as a portable JSON session file
   */
  exportDeckJson() {
    const songs = StorageManager.loadSongs();
    if (songs.length === 0) {
      this.showToast('Your Studio Deck is empty. Add songs before exporting a session.', 'amber');
      return;
    }
    const jsonStr = StorageManager.exportPlaylist();
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `Suno_Studio_Session_${stamp}.json`;
    this.triggerDownload(blob, filename);
    this.showToast(`Exported Studio Session (${songs.length} tracks): "${filename}"`, 'emerald');
  }

  /**
   * Imports a saved Studio Deck JSON session file
   */
  async handleImportDeckJson(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const jsonText = await file.text();
      const added = StorageManager.importPlaylist(jsonText);
      this.renderSongs();
      this.showToast(`Imported ${added} new track(s) into your Studio Deck!`, 'emerald');
    } catch (err) {
      this.showToast(`Invalid Studio Session JSON: ${err.message}`, 'rose');
    } finally {
      event.target.value = '';
    }
  }

  setupPwa() {
    if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
      navigator.serviceWorker.register('./sw.js?v=2026.11.3.1', { updateViaCache: 'none' }).catch((err) => {
        console.warn('Service worker registration skipped:', err);
      });
    }

    const btn = document.getElementById('btnInstallPwa');
    const isAndroidNative = !!window.AndroidStudio || document.body.dataset.screen === 'library';
    const isDesktopApp = location.port === '47831' || location.search.includes('desktop=1');
    const isStandalonePwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    // Only show "Install App" if running in an uninstalled web browser tab
    if (btn) {
      if (!isAndroidNative && !isDesktopApp && !isStandalonePwa) {
        btn.style.display = 'inline-flex';
      } else {
        btn.style.display = 'none';
      }
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (btn && !isAndroidNative && !isDesktopApp && !isStandalonePwa) {
        btn.style.display = 'inline-flex';
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      if (btn) btn.style.display = 'none';
      this.showToast('Installed NTK SoundLab Studio App!', 'emerald');
    });
  }

  openTutorialModal(step = 0) {
    if (this.tutorial) {
      this.tutorial.open(step);
    } else {
      const modal = document.getElementById('tutorialModal');
      if (modal) modal.classList.add('open');
    }
  }

  openInstallModal() {
    if (this.deferredInstallPrompt) {
      this.deferredInstallPrompt.prompt();
      this.deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          this.showToast('Installing NTK SoundLab Studio...', 'emerald');
        }
        this.deferredInstallPrompt = null;
      });
      return;
    }
    const modal = document.getElementById('installAppModal');
    if (modal) modal.classList.add('open');
  }

  async installPwa() {
    this.openInstallModal();
  }

  async handleDeepLinkParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const songParam = params.get('song');
      const openAction = params.get('open');
      if (!songParam) return;

      const uuids = SunoAPI.extractUuids(songParam);
      if (uuids.length === 0) return;

      const uuid = uuids[0];
      let bridgePayload = null;
      if (window.location.hash && window.location.hash.includes('bridge=')) {
        try {
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
          const b64 = hashParams.get('bridge');
          if (b64) {
            bridgePayload = JSON.parse(decodeURIComponent(escape(atob(b64))));
          }
        } catch (err) {}
      }

      const existing = StorageManager.loadSongs().find((s) => s.uuid === uuid);
      const meta = existing ? { ...existing } : await SunoAPI.fetchMetadata(uuid);
      meta.playerMode = 'custom';
      meta.hasStem = true;
      meta.album = meta.album || 'NTK Hub';
      if (bridgePayload) {
        if (bridgePayload.title && !bridgePayload.title.startsWith('Suno_Song_')) {
          meta.title = bridgePayload.title;
        }
        if (bridgePayload.prompt && bridgePayload.prompt.trim()) {
          meta.prompt = bridgePayload.prompt.trim();
        }
        if (bridgePayload.rights && bridgePayload.rights.key && bridgePayload.rights.iv && bridgePayload.rights.glt) {
          meta.rights = bridgePayload.rights;
        }
      }
      StorageManager.upsertSong(meta);
      this.renderSongs();

      // Clean query & hash params without reload
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);

      if (openAction === 'stems') {
        this.openStemsStudio(uuid);
      } else if (openAction === 'trim') {
        this.openTrimFxStudio(uuid);
      } else if (openAction === 'video') {
        this.openVideoStudio(uuid);
      }
    } catch (e) {}
  }

  setupBookmarklet() {
    const magicBtn = document.getElementById('sunoMagicBookmarklet');
    if (magicBtn) {
      magicBtn.href = BookmarkletEngine.getBookmarkletUrl();
    }
  }

  stopAllModalAudio() {
    this.transcribe?.closed();
    this._previewRequest = null;
    this._studioOpenRequest = null;
    this.stemMixer.stop();
    this.stopFxPreview();
    if (this.tapSyncState && this.tapSyncState.active) {
      this.cancelTapToSync(false);
    }
    if (this.videoStudio) {
      this.videoStudio.stop();
      const prevBtn = document.getElementById('btnVideoLivePreview');
      if (prevBtn) prevBtn.textContent = '▶ Live Preview with Audio';
    }
  }

  setupUIBindings() {
    const addBtn = document.getElementById('btnAddSong');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.handleSongInput());
    }

    const inputArea = document.getElementById('songUrlInput');
    if (inputArea) {
      inputArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSongInput();
        }
      });
    }

    const clearInputBtn = document.getElementById('btnClearInput');
    if (clearInputBtn) {
      clearInputBtn.addEventListener('click', () => {
        if (inputArea) {
          inputArea.value = '';
          inputArea.focus();
        }
      });
    }

    const chkAudioOnly = document.getElementById('chkAudioOnlyGrab');
    if (chkAudioOnly) {
      chkAudioOnly.addEventListener('change', (e) => {
        this.isAudioOnlyGrab = e.target.checked;
        this.showToast(this.isAudioOnlyGrab ? 'Data-Saver ON: Grabbing audio streams only' : 'Universal Mode: Video & Audio enabled', 'cyan');
      });
    }

    document.getElementById('btnOpenCookies')?.addEventListener('click', () => this.openCookieModal());
    document.getElementById('btnSaveCookies')?.addEventListener('click', () => this.saveUserCookies());
    document.getElementById('btnPurgeVault')?.addEventListener('click', () => this.purgeEntireVault());
    document.getElementById('btnClearVaultStems')?.addEventListener('click', () => this.clearVaultStems());
    document.getElementById('btnClearVaultMasters')?.addEventListener('click', () => this.clearVaultMasters());

    const clearAllBtn = document.getElementById('btnClearAll');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async () => {
        if (confirm('Clear all media from your deck and remove cached streams from Offline Vault?')) {
          this.player.pause();
          this.stopAllModalAudio();
          StorageManager.clearAll();
          await VaultDB.clearAll();
          await this.refreshVaultSummary(false);
          this.renderSongs();
          this.showToast('Cleared media deck and offline cache.', 'amber');
        }
      });
    }

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('open');
          this.stopAllModalAudio();
        }
      });
    });

    document.querySelectorAll('.modal-overlay').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('open');
          this.stopAllModalAudio();
        }
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const container = document.getElementById('canvasContainer');
        if (container && (container.classList.contains('cinema-fullscreen') || document.fullscreenElement)) {
          this.exitPreviewFullscreen();
          return;
        }
        document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open'));
        this.stopAllModalAudio();
      }
    });

    window.addEventListener('pointerup', () => {
      this.isUserDraggingScrubber = false;
    });
  }

  setupDropzone() {
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        // If Video Studio Modal is open and image files are dropped anywhere on window, automatically add them to Multi-Slide Storyteller!
        const studioModal = document.getElementById('videoStudioModal');
        const isStudioOpen = studioModal && studioModal.classList.contains('open');
        const imageFiles = Array.from(files).filter(
          (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name)
        );

        if (isStudioOpen && imageFiles.length > 0) {
          await this.addSlideFiles(imageFiles);
          return;
        }

        for (const file of files) {
          if (VideoDemuxer.isVideo(file)) {
            await this.importVideoFile(file);
          } else if (/\.(m4a|mp3|wav|flac|ogg|aac|opus)$/i.test(file.name) || file.type.startsWith('audio/')) {
            await this.importAudioFile(file);
          }
        }
      }
    });
  }

  async handleLocalFileSelect(event) {
    const files = event.target && event.target.files;
    if (!files || files.length === 0) return;
    for (const file of files) {
      if (VideoDemuxer.isVideo(file)) {
        await this.importVideoFile(file);
      } else {
        await this.importAudioFile(file);
      }
    }
    event.target.value = '';
  }

  async importVideoFile(file) {
    try {
      this.showToast(`Demuxing video "${file.name}"...`, 'cyan');
      const meta = await VideoDemuxer.demux(file, (pct, msg) => {
        if (pct < 100) this.showToast(msg, 'cyan');
      });

      const title = file.name.replace(/\.[^/.]+$/, '');
      const pseudoUuid = 'video-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 6);
      const wavBytes = AudioConverter.encodeWavArrayBuffer(meta.audioBuffer);

      const songObj = {
        uuid: pseudoUuid,
        title,
        artist: 'Local Video Demux',
        prompt: '',
        tags: `Video Track • ${meta.width}x${meta.height}`,
        duration: meta.duration,
        model: `${Math.round(meta.audioBuffer.sampleRate / 100) / 10}kHz Stereo`,
        streamUrl: '',
        imageLarge: meta.thumbnailDataUrl,
        imageThumb: meta.thumbnailDataUrl,
        videoUrl: '',
        platform: 'Video File',
        hasVideo: true,
        hasStem: true,
        showDetails: false,
        playerMode: 'custom'
      };

      StorageManager.upsertSong(songObj);
      StorageManager.setCachedBuffer(pseudoUuid, {
        decryptedBuffer: wavBytes,
        audioBuffer: meta.audioBuffer
      });
      await VaultDB.saveMaster(pseudoUuid, wavBytes);
      await this.refreshVaultSummary(false);
      this.renderSongs();
      this.showToast(`Ready! Video audio stripped & poster captured for "${title}".`, 'emerald');
    } catch (err) {
      this.showToast(`Could not demux video: ${err.message}`, 'rose');
    }
  }

  async importAudioFile(file) {
    try {
      this.showToast(`Importing "${file.name}" into Studio...`, 'emerald');
      const arrayBuf = await file.arrayBuffer();
      const audioBuffer = await AudioConverter.decodeAudioData(arrayBuf);
      const title = file.name.replace(/\.[^/.]+$/, '');
      const pseudoUuid = 'local-' + Date.now().toString(16) + '-' + Math.random().toString(16).slice(2, 6);

      const songObj = {
        uuid: pseudoUuid,
        title,
        prompt: '',
        tags: 'Local Audio Track',
        duration: audioBuffer.duration,
        model: `${Math.round(audioBuffer.sampleRate / 100) / 10}kHz Stereo`,
        streamUrl: '',
        imageLarge: '',
        videoUrl: '',
        platform: 'Audio File',
        hasStem: true,
        showDetails: false,
        playerMode: 'custom'
      };

      StorageManager.upsertSong(songObj);
      StorageManager.setCachedBuffer(pseudoUuid, {
        decryptedBuffer: arrayBuf,
        audioBuffer
      });
      await VaultDB.saveMaster(pseudoUuid, arrayBuf);
      await this.refreshVaultSummary(false);
      this.renderSongs();
      this.showToast(`Ready! "${title}" (${this.formatDuration(audioBuffer.duration)}) cached in Studio Vault.`, 'emerald');
    } catch (err) {
      this.showToast(`Could not decode audio file: ${err.message}`, 'rose');
    }
  }

  async refreshVaultSummary(reRender = true) {
    this.vaultSummary = await VaultDB.getVaultSummary();
    const badge = document.getElementById('vaultBadgeText');
    if (badge) {
      const count = new Set([...this.vaultSummary.masterIds, ...this.vaultSummary.stemIds]).size;
      const aiTag = this.vaultSummary.hasOnnxModel ? ' + AI' : '';
      badge.textContent = `Vault: ${count}${aiTag}`;
    }
    if (reRender) {
      this.renderSongs();
    }
  }

  async handleVaultClick() {
    this.openVaultModal();
  }

  async openVaultModal() {
    const modal = document.getElementById('vaultModal');
    if (!modal) return;
    await this.refreshVaultSummary(false);
    const sizeEl = document.getElementById('vaultModalSizeText');
    const mastersEl = document.getElementById('vaultModalMastersCount');
    const stemsEl = document.getElementById('vaultModalStemsCount');
    const modelsEl = document.getElementById('vaultModalModelsStatus');

    if (sizeEl) sizeEl.textContent = this.vaultSummary.formattedSize || '0 MB';
    if (mastersEl) mastersEl.textContent = String(this.vaultSummary.masterIds.size);
    if (stemsEl) stemsEl.textContent = String(this.vaultSummary.stemIds.size);
    if (modelsEl) modelsEl.textContent = this.vaultSummary.hasOnnxModel ? 'Cached (172 MB ONNX)' : 'On-Demand';
    modal.classList.add('open');
  }

  async clearVaultStems() {
    await VaultDB.clearStore('stems_cache');
    await this.refreshVaultSummary(true);
    this.showToast('Cleared separated stems from Offline Vault.', 'amber');
    this.openVaultModal();
  }

  async clearVaultMasters() {
    await VaultDB.clearStore('audio_masters');
    await this.refreshVaultSummary(true);
    this.showToast('Cleared master audio streams from Offline Vault.', 'amber');
    this.openVaultModal();
  }

  async purgeEntireVault() {
    if (confirm('Permanently clear all cached audio, stems, and videos from your browser storage?')) {
      await VaultDB.clearAll();
      StorageManager.clearAll();
      await this.refreshVaultSummary(true);
      document.getElementById('vaultModal')?.classList.remove('open');
      this.showToast('Purged entire Offline Vault storage!', 'amber');
    }
  }

  async openCookieModal() {
    const modal = document.getElementById('cookieModal');
    if (!modal) return;
    const textarea = document.getElementById('cookieTextInput');
    if (textarea) {
      textarea.value = await VaultDB.getCookies();
    }
    modal.classList.add('open');
  }

  async saveUserCookies() {
    const textarea = document.getElementById('cookieTextInput');
    if (!textarea) return;
    const txt = textarea.value.trim();
    await VaultDB.saveCookies(txt);
    try {
      await OmniAPI.saveCookies(txt);
    } catch (e) {}
    this.showToast('Saved user session cookies for private/age-restricted media!', 'emerald');
    document.getElementById('cookieModal')?.classList.remove('open');
  }

  async checkProxyStatus() {
    const [helperCaps, demucsCaps] = await Promise.all([
      OmniAPI.checkLocalHelper(),
      StemEngine.checkLocalDemucs()
    ]);

    this.helperStatus = helperCaps;
    this.isLocalProxyActive = helperCaps.active;
    this.localDemucsCaps = demucsCaps;

    const statusPill = document.getElementById('proxyStatusPill');
    if (!statusPill) return;

    if (helperCaps.active) {
      statusPill.innerHTML = `
        <span class="status-dot active"></span>
        <span style="color:#6ee7b7;font-weight:700">OmniHelper Online • yt-dlp ${helperCaps.ytdl ? '✓' : '✗'} • ${demucsCaps.available ? 'PyTorch ' + String(demucsCaps.device).toUpperCase() : 'WebGPU'}</span>
      `;
    } else {
      const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
      statusPill.innerHTML = `
        <span class="status-dot" style="background:#06b6d4;box-shadow:0 0 8px #06b6d4"></span>
        <span style="color:#bae6fd">Static Firebase Mode • Browser ${hasGpu ? 'WebGPU' : 'WASM'} AI Active</span>
      `;
    }
  }

  async handleSongInput() {
    const inputArea = document.getElementById('songUrlInput');
    if (!inputArea) return;
    const text = inputArea.value.trim();

    if (!text) {
      this.showToast('Paste any video or audio link (YouTube, TikTok, SoundCloud, Suno, etc.) or UUID.', 'amber');
      inputArea.focus();
      return;
    }

    inputArea.value = '';
    const lines = text.split(/[\r\n,;\s]+/).map((s) => s.trim()).filter(Boolean);
    let totalAdded = 0;

    for (const item of lines) {
      this.showToast(`Resolving link: ${item.slice(0, 36)}...`, 'cyan');
      try {
        const info = await OmniAPI.resolveUrl(item);
        if (info.type === 'playlist') {
          const clips = info.clips || [];
          for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            clip.album = info.title || 'Playlist';
            clip.trackNumber = `${String(i + 1).padStart(2, '0')}/${String(clips.length).padStart(2, '0')}`;
            clip.year = clip.year || String(new Date().getFullYear());
            StorageManager.upsertSong(clip);
            totalAdded++;
          }
          this.showToast(`Loaded playlist "${info.title}" (${clips.length} tracks)!`, 'emerald');
        } else {
          StorageManager.upsertSong(info);
          totalAdded++;
        }
      } catch (err) {
        // Fallback check if Suno link or UUID
        let targetUuid = null;
        const sunoMatch = item.match(OmniAPI.SUNO_UUID_REGEX);
        if (sunoMatch) {
          targetUuid = sunoMatch[0].toLowerCase();
        } else if (item.toLowerCase().includes('suno.com') || item.toLowerCase().includes('suno.ai')) {
          try {
            const uRes = await fetch(`/api/suno/unshorten?url=${encodeURIComponent(item)}`);
            if (uRes.ok) {
              const uData = await uRes.json();
              if (uData && uData.uuid) targetUuid = uData.uuid.toLowerCase();
            }
          } catch (eUn) {}
        }

        if (targetUuid) {
          try {
            const meta = await SunoAPI.fetchMetadata(targetUuid);
            meta.playerMode = 'custom';
            meta.hasStem = true;
            meta.platform = 'Suno AI';
            meta.streamUrl = `/api/suno/stream/${targetUuid}`;
            meta.url = `https://suno.com/song/${targetUuid}`;
            StorageManager.upsertSong(meta);
            totalAdded++;
          } catch (e2) {
            this.showToast(`Could not resolve "${item}": ${err.message}`, 'rose');
          }
        } else {
          this.showToast(`Error resolving "${item}": ${err.message}`, 'rose');
        }
      }
    }

    this.renderSongs();
    if (totalAdded > 0) {
      this.showToast(`Added ${totalAdded} track(s) to NTK SoundLab Deck!`, 'emerald');
    }
  }

  /**
   * Universal Decryptor & Stream Extraction Pipeline
   */
  async getDecryptedAudio(uuid, onProgress = () => {}) {
    const cached = StorageManager.getCachedBuffer(uuid);
    if (cached && cached.decryptedBuffer && cached.audioBuffer) {
      return cached;
    }

    // Check IndexedDB Offline Vault
    const vaultMaster = await VaultDB.getMaster(uuid);
    if (vaultMaster && vaultMaster.byteLength > 0) {
      onProgress('Restoring master audio from Offline Vault...');
      const audioBuffer = await AudioConverter.decodeAudioData(vaultMaster);
      const payload = {
        decryptedBuffer: vaultMaster,
        audioBuffer,
        stems: cached ? cached.stems : null
      };
      StorageManager.setCachedBuffer(uuid, payload);
      return payload;
    }

    if (String(uuid).startsWith('local-') || String(uuid).startsWith('video-')) {
      throw new Error('Local file buffer was cleared. Please re-import the file.');
    }

    const storedSong = StorageManager.loadSongs().find((s) => s.uuid === uuid);

    // Direct Media File (MP3, WAV, M4A, etc.)
    if (String(uuid).startsWith('direct-') || (storedSong && storedSong.platform === 'Direct Media File')) {
      const mediaUrl = (storedSong && (storedSong.streamUrl || storedSong.url)) || '';
      if (!mediaUrl) throw new Error('Direct media URL missing.');
      onProgress('Downloading direct audio stream...');
      const streamRes = await fetch(mediaUrl);
      if (!streamRes.ok) throw new Error(`Media fetch returned HTTP ${streamRes.status}`);
      const rawBytes = await streamRes.arrayBuffer();
      const audioBuffer = await AudioConverter.decodeAudioData(rawBytes);
      const payload = {
        decryptedBuffer: rawBytes,
        audioBuffer,
        stems: null
      };
      StorageManager.setCachedBuffer(uuid, payload);
      await VaultDB.saveMaster(uuid, rawBytes);
      await this.refreshVaultSummary(false);
      return payload;
    }

    // Check if track is a Suno AI track (by platform tag, Suno URL, or Suno UUID format)
    const isSuno = (storedSong && storedSong.platform === 'Suno AI') ||
                   (storedSong && storedSong.url && (storedSong.url.includes('suno.com') || storedSong.url.includes('suno.ai'))) ||
                   (!String(uuid).startsWith('omni-') && !String(uuid).startsWith('direct-') && !String(uuid).startsWith('local-') && OmniAPI.SUNO_UUID_REGEX.test(String(uuid)));

    // Universal Media (YouTube, TikTok, SoundCloud, etc.)
    if (!isSuno && (String(uuid).startsWith('omni-') || (storedSong && storedSong.platform && storedSong.platform !== 'Suno AI'))) {
      if (!storedSong || !storedSong.url) {
        throw new Error('Media URL missing for track.');
      }
      onProgress(`Connecting to OmniHelper for stream extraction...`);
      const isAudioOnly = true;
      const jobId = await OmniAPI.startDownload(storedSong.url, 'wav', isAudioOnly);
      const downloadUrl = await OmniAPI.pollJob(jobId, (pct, msg) => {
        onProgress(`Extracting stream (${pct}%): ${msg}`);
      });
      onProgress('Downloading extracted lossless audio stream...');
      const streamRes = await fetch(downloadUrl);
      if (!streamRes.ok) throw new Error(`Media fetch returned HTTP ${streamRes.status}`);
      const rawBytes = await streamRes.arrayBuffer();
      const audioBuffer = await AudioConverter.decodeAudioData(rawBytes);
      const payload = {
        decryptedBuffer: rawBytes,
        audioBuffer,
        stems: null
      };
      StorageManager.setCachedBuffer(uuid, payload);
      await VaultDB.saveMaster(uuid, rawBytes);
      await this.refreshVaultSummary(false);
      return payload;
    }

    onProgress('Requesting Mango DRM rights...');
    let rights = (storedSong && storedSong.rights && storedSong.rights.key && storedSong.rights.iv && storedSong.rights.glt)
      ? storedSong.rights
      : null;
    if (!rights) {
      try {
        rights = await SunoAPI.fetchRights(uuid);
      } catch (err) {
        console.warn('DRM rights fetch error:', err);
        throw err;
      }
    }

    onProgress('Downloading CloudFront encrypted audio...');
    const encBuffer = await SunoAPI.downloadEncryptedStream(uuid, (pct) => {
      onProgress(`Downloading audio stream (${pct}%)...`);
    });

    onProgress('Decrypting audio stream via AES-CTR...');
    const decryptedBuffer = await CryptoEngine.decryptStream(encBuffer, rights, uuid, onProgress);

    onProgress('Decoding audio data & saving to Offline Vault...');
    const audioBuffer = await AudioConverter.decodeAudioData(decryptedBuffer);

    await VaultDB.saveMaster(uuid, decryptedBuffer);
    await this.refreshVaultSummary(true);

    // Update accurate duration in song metadata if needed
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (song && (!song.duration || Math.abs(song.duration - audioBuffer.duration) > 1)) {
      song.duration = audioBuffer.duration;
      StorageManager.upsertSong(song);
    }

    const cachePayload = {
      decryptedBuffer,
      audioBuffer
    };
    StorageManager.setCachedBuffer(uuid, cachePayload);
    return cachePayload;
  }

  /**
   * Action: Download Original Untouched M4A
   */
  async downloadM4a(uuid) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    this.setBtnLoading(`btn-m4a-${uuid}`, true, 'Decrypting...');
    try {
      const { decryptedBuffer } = await this.getDecryptedAudio(uuid, (status) => {
        this.setBtnLoading(`btn-m4a-${uuid}`, true, status);
      });

      const blob = new Blob([decryptedBuffer], { type: 'audio/mp4' });
      const filename = this.makeSafeFilename(song.title, 'm4a');
      this.triggerDownload(blob, filename);
      this.showToast(`Downloaded Master M4A: "${filename}"`, 'emerald');
    } catch (e) {
      this.showToast(`Download error: ${e.message}`, 'rose');
    } finally {
      this.setBtnLoading(`btn-m4a-${uuid}`, false);
    }
  }

  /**
   * Action: Download Lossless 16-bit Studio WAV
   */
  async downloadWav(uuid) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    this.setBtnLoading(`btn-wav-${uuid}`, true, 'Processing...');
    try {
      const { audioBuffer } = await this.getDecryptedAudio(uuid, (status) => {
        this.setBtnLoading(`btn-wav-${uuid}`, true, status);
      });

      this.setBtnLoading(`btn-wav-${uuid}`, true, 'Encoding WAV...');
      const wavBlob = AudioConverter.encodeWav(audioBuffer);
      const filename = this.makeSafeFilename(song.title, 'wav');
      this.triggerDownload(wavBlob, filename);
      this.showToast(`Downloaded Studio WAV: "${filename}"`, 'emerald');
    } catch (e) {
      this.showToast(`WAV conversion failed: ${e.message}`, 'rose');
    } finally {
      this.setBtnLoading(`btn-wav-${uuid}`, false);
    }
  }

  /**
   * Action: Download 320kbps MP3 with Embedded ID3v2.3 Metadata, Lyrics & Cover Art
   */
  async downloadMp3(uuid) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    this.setBtnLoading(`btn-mp3-${uuid}`, true, 'Decoding...');
    try {
      const { audioBuffer } = await this.getDecryptedAudio(uuid, (status) => {
        this.setBtnLoading(`btn-mp3-${uuid}`, true, status);
      });

      this.setBtnLoading(`btn-mp3-${uuid}`, true, 'MP3 0%...');
      const rawMp3 = await Mp3Encoder.encode(audioBuffer, 320, (pct) => {
        this.setBtnLoading(`btn-mp3-${uuid}`, true, `MP3 ${pct}%`);
      });

      this.setBtnLoading(`btn-mp3-${uuid}`, true, 'Tagging ID3...');
      const taggedMp3 = await ID3Writer.embedTags(rawMp3, {
        title: song.title,
        artist: song.artist || 'Suno AI Studio',
        album: song.album || 'NTK Hub',
        trackNumber: song.trackNumber || '01/01',
        year: song.year || String(new Date().getFullYear()),
        genre: song.tags,
        lyrics: song.prompt,
        coverUrl: song.imageLarge,
        coverBytes: song.customCoverBytes || null
      });

      const filename = this.makeSafeFilename(song.title, 'mp3');
      this.triggerDownload(taggedMp3, filename);
      this.showToast(`Downloaded Tagged 320k MP3 (with Cover Art & Lyrics): "${filename}"`, 'emerald');
    } catch (e) {
      this.showToast(`MP3 encoding failed: ${e.message}`, 'rose');
    } finally {
      this.setBtnLoading(`btn-mp3-${uuid}`, false);
    }
  }

  /**
   * Action: Download Complete Song Studio Pack (.ZIP)
   */
  async downloadSongPackZip(uuid) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    this.setBtnLoading(`btn-pack-${uuid}`, true, 'Preparing ZIP...');
    try {
      const payload = await this.getDecryptedAudio(uuid, (st) => {
        this.setBtnLoading(`btn-pack-${uuid}`, true, st);
      });
      const cachedStemsWavs = await VaultDB.getStems(uuid);

      const zipBlob = await ZipPackager.buildSongPackZip(song, payload, cachedStemsWavs, (pct, msg) => {
        this.setBtnLoading(`btn-pack-${uuid}`, true, `${pct}% ${msg.slice(0, 18)}...`);
      });

      const filename = this.makeSafeFilename(`${song.title} - Studio Pack`, 'zip');
      this.triggerDownload(zipBlob, filename);
      this.showToast(`Downloaded Complete Studio Pack: "${filename}"`, 'emerald');
    } catch (e) {
      this.showToast(`Studio Pack ZIP failed: ${e.message}`, 'rose');
    } finally {
      this.setBtnLoading(`btn-pack-${uuid}`, false);
    }
  }

  /**
   * Action: Batch Download Entire Deck as a Single .ZIP
   */
  async downloadBatchDeckZip(format = 'mp3') {
    const songs = StorageManager.loadSongs();
    if (songs.length === 0) {
      this.showToast('Your song deck is empty. Add songs first!', 'amber');
      return;
    }

    const btnId = format === 'mp3' ? 'btnBatchZipMp3' : 'btnBatchZipM4a';
    this.setBtnLoading(btnId, true, 'Batch 0%...');

    try {
      const zipBlob = await ZipPackager.buildBatchDeckZip(
        songs,
        (uuid, stCb) => this.getDecryptedAudio(uuid, stCb),
        format,
        (pct, text) => {
          this.setBtnLoading(btnId, true, `${pct}%`);
          console.info(`[Batch ZIP] ${pct}% - ${text}`);
        }
      );

      const filename = this.makeSafeFilename(`Suno_Studio_Batch_${songs.length}_Songs_${format.toUpperCase()}`, 'zip');
      this.triggerDownload(zipBlob, filename);
      this.showToast(`Exported Batch ZIP (${songs.length} songs): "${filename}"!`, 'emerald');
    } catch (e) {
      this.showToast(`Batch ZIP failed: ${e.message}`, 'rose');
    } finally {
      this.setBtnLoading(btnId, false);
    }
  }

  /* =========================================================================
     4-STEM NEURAL AI CONSOLE (META HTDEMUCS v4)
     ========================================================================= */

  async openStemsStudio(uuid, forceRecompute = false) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    this.player.pause();
    this.stopAllModalAudio();
    this.activeStemsSong = song;

    const modal = document.getElementById('stemsModal');
    if (!modal) return;
    modal.classList.add('open');

    const titleEl = document.getElementById('stemsModalTitle');
    const progressCard = document.getElementById('stemsProgressCard');
    const progressBar = document.getElementById('stemsProgressBar');
    const progressPct = document.getElementById('stemsProgressPct');
    const statusEl = document.getElementById('stemsStatusText');
    const consoleWrap = document.getElementById('stemsConsoleWrap');
    const engineSelect = document.getElementById('stemEngineMode');
    const engineBadge = document.getElementById('stemActiveEngineBadge');
    const rerunBtn = document.getElementById('btnReseparateStems');

    if (titleEl) titleEl.textContent = `4-Stem Neural Console: ${song.title}`;
    if (progressCard) progressCard.style.display = 'flex';
    if (consoleWrap) consoleWrap.style.display = 'none';
    if (progressBar) progressBar.style.width = '2%';
    if (progressPct) progressPct.textContent = '2%';
    if (statusEl) statusEl.textContent = 'Preparing lossless master audio...';
    if (rerunBtn) rerunBtn.disabled = true;

    const mode = engineSelect ? engineSelect.value : 'auto';

    try {
      const { audioBuffer } = await this.getDecryptedAudio(uuid, (status) => {
        if (statusEl) statusEl.textContent = status;
      });

      const stemBundle = await StemEngine.separate(uuid, audioBuffer, {
        mode,
        forceRecompute,
        onProgress: ({ percent, stage, engine }) => {
          if (progressBar) progressBar.style.width = `${percent}%`;
          if (progressPct) progressPct.textContent = `${percent}%`;
          if (statusEl) statusEl.textContent = stage;
          if (engine && engineBadge) engineBadge.textContent = engine;
        }
      });

      const cached = StorageManager.getCachedBuffer(uuid) || {};
      cached.stems = stemBundle;
      StorageManager.setCachedBuffer(uuid, cached);

      await this.refreshVaultSummary(true);

      this.stemMixer.loadStems(stemBundle);

      const targetModeSelect = document.getElementById('stemTargetMode');
      const targetMode = (targetModeSelect && targetModeSelect.value) || '2-stem';
      this.handleStemTargetModeChange(targetMode, false);

      if (engineBadge) engineBadge.textContent = `✓ ${stemBundle.engine || 'HTDemucs v4'}`;
      if (progressBar) progressBar.style.width = '100%';
      if (progressPct) progressPct.textContent = '100%';
      if (progressCard) progressCard.style.display = 'none';
      if (consoleWrap) consoleWrap.style.display = 'flex';
    } catch (e) {
      if (statusEl) {
        statusEl.innerHTML = `❌ <strong>Stem Separation Error:</strong> ${this.escapeHtml(e.message)}`;
      }
      this.showToast(`Stem separation error: ${e.message}`, 'rose');
    } finally {
      if (rerunBtn) rerunBtn.disabled = false;
    }
  }

  handleStemTargetModeChange(mode, showNotification = true) {
    if (!this.stemMixer) return;
    this.stemMixer.setTargetMode(mode);
    const select = document.getElementById('stemTargetMode');
    if (select && select.value !== mode) select.value = mode;

    const titleEl = document.getElementById('stemsModalTitle');
    const songTitle = this.activeStemsSong ? this.activeStemsSong.title : '';

    const stripVocals = document.getElementById('stem-strip-vocals');
    const stripLead = document.getElementById('stem-strip-lead_vocals');
    const stripBacking = document.getElementById('stem-strip-backing_vocals');
    const stripInstrumental = document.getElementById('stem-strip-instrumental');
    const stripDrums = document.getElementById('stem-strip-drums');
    const stripBass = document.getElementById('stem-strip-bass');
    const stripOther = document.getElementById('stem-strip-other');
    const splitBtn = document.getElementById('btnSplitVocals');

    const chipDrumless = document.getElementById('chip-preset-drumless');
    const chipRhythm = document.getElementById('chip-preset-rhythm');
    const chipBoost = document.getElementById('chip-preset-boost');

    const cached = this.activeStemsSong ? StorageManager.getCachedBuffer(this.activeStemsSong.uuid) : null;
    const stems = cached && cached.stems ? cached.stems : (this.stemMixer.stems || {});
    const hasSplit = Boolean(stems.lead_vocals && stems.backing_vocals);

    if (mode === '2-stem') {
      if (titleEl) titleEl.textContent = `2-Stem Studio (Vocals + Instrumental): ${songTitle}`;
      if (stripVocals) stripVocals.style.display = 'flex';
      if (stripInstrumental) stripInstrumental.style.display = 'flex';
      if (stripLead) stripLead.style.display = 'none';
      if (stripBacking) stripBacking.style.display = 'none';
      if (stripDrums) stripDrums.style.display = 'none';
      if (stripBass) stripBass.style.display = 'none';
      if (stripOther) stripOther.style.display = 'none';
      if (splitBtn) splitBtn.style.display = 'none';
      if (chipDrumless) chipDrumless.style.display = 'none';
      if (chipRhythm) chipRhythm.style.display = 'none';
      if (chipBoost) chipBoost.style.display = 'inline-block';
      this.stemMixer.applyPreset('full');
      this.syncStemConsoleControls('full');
      if (showNotification) this.showToast('2-Stem Mode Active (Vocals + Clean Instrumental)!', 'emerald');
    } else if (mode === 'vocal-split') {
      if (titleEl) titleEl.textContent = `Vocal Demix Console (Lead + Backing): ${songTitle}`;
      if (chipDrumless) chipDrumless.style.display = 'none';
      if (chipRhythm) chipRhythm.style.display = 'none';
      if (chipBoost) chipBoost.style.display = 'none';
      if (splitBtn) splitBtn.style.display = 'inline-flex';
      if (!hasSplit) {
        this.splitCurrentVocals();
      } else {
        if (stripVocals) stripVocals.style.display = 'none';
        if (stripLead) stripLead.style.display = 'flex';
        if (stripBacking) stripBacking.style.display = 'flex';
        if (stripInstrumental) stripInstrumental.style.display = 'flex';
        if (stripDrums) stripDrums.style.display = 'none';
        if (stripBass) stripBass.style.display = 'none';
        if (stripOther) stripOther.style.display = 'none';
        this.stemMixer.applyPreset('full');
        this.syncStemConsoleControls('full');
        if (showNotification) this.showToast('Vocal Demix Mode Active (Lead + Backing Harmonies)!', 'emerald');
      }
    } else if (mode === '5-stem') {
      if (titleEl) titleEl.textContent = `5-Stem Studio Kit (All Tracks): ${songTitle}`;
      if (chipDrumless) chipDrumless.style.display = 'inline-block';
      if (chipRhythm) chipRhythm.style.display = 'inline-block';
      if (chipBoost) chipBoost.style.display = 'none';
      if (splitBtn) splitBtn.style.display = 'inline-flex';
      if (!hasSplit) {
        this.splitCurrentVocals();
      } else {
        if (stripVocals) stripVocals.style.display = 'none';
        if (stripLead) stripLead.style.display = 'flex';
        if (stripBacking) stripBacking.style.display = 'flex';
        if (stripInstrumental) stripInstrumental.style.display = 'none';
        if (stripDrums) stripDrums.style.display = 'flex';
        if (stripBass) stripBass.style.display = 'flex';
        if (stripOther) stripOther.style.display = 'flex';
        this.stemMixer.applyPreset('full');
        this.syncStemConsoleControls('full');
        if (showNotification) this.showToast('5-Stem Studio Kit Mode Active (All Tracks)!', 'emerald');
      }
    } else {
      // 4-stem mode
      if (titleEl) titleEl.textContent = `4-Stem Neural Console: ${songTitle}`;
      if (stripVocals) stripVocals.style.display = 'flex';
      if (stripLead) stripLead.style.display = 'none';
      if (stripBacking) stripBacking.style.display = 'none';
      if (stripInstrumental) stripInstrumental.style.display = 'none';
      if (stripDrums) stripDrums.style.display = 'flex';
      if (stripBass) stripBass.style.display = 'flex';
      if (stripOther) stripOther.style.display = 'flex';
      if (splitBtn) splitBtn.style.display = 'inline-flex';
      if (chipDrumless) chipDrumless.style.display = 'inline-block';
      if (chipRhythm) chipRhythm.style.display = 'inline-block';
      if (chipBoost) chipBoost.style.display = 'none';
      this.stemMixer.applyPreset('full');
      this.syncStemConsoleControls('full');
      if (showNotification) this.showToast('4-Stem Mode Active (Vocals, Drums, Bass, Melodies)!', 'emerald');
    }
  }

  reseparateActiveStems() {
    if (!this.activeStemsSong) return;
    this.openStemsStudio(this.activeStemsSong.uuid, true);
  }

  toggleStemMixerPlay() {
    if (!this.stemMixer.stems) return;
    if (this.stemMixer.isPlaying) {
      this.stemMixer.pause();
    } else {
      this.stemMixer.play();
    }
    this.updateStemPlayBtn();
  }

  stopStemMixer() {
    this.stemMixer.stop();
    this.updateStemPlayBtn();
  }

  updateStemPlayBtn() {
    const btn = document.getElementById('stemMixPlayBtn');
    if (btn) {
      btn.textContent = this.stemMixer.isPlaying ? '❚❚ Pause' : '▶ Play Mix';
    }
  }

  seekStemMixer(sliderVal) {
    if (!this.stemMixer.duration) return;
    const ratio = Math.max(0, Math.min(1, Number(sliderVal) / 1000));
    this.stemMixer.seek(ratio * this.stemMixer.duration);
  }

  applyStemPreset(preset) {
    this.stemMixer.applyPreset(preset);
    this.syncStemConsoleControls(preset);
  }

  toggleStemMute(track) {
    this.stemMixer.toggleMute(track);
    this.syncStemConsoleControls('');
  }

  toggleStemSolo(track) {
    this.stemMixer.toggleSolo(track);
    this.syncStemConsoleControls('');
  }

  setStemVolume(track, pctVal) {
    const pct = Math.max(0, Math.min(150, Number(pctVal)));
    this.stemMixer.setVolume(track, pct / 100);
    const label = document.getElementById(`stem-gain-${track}`);
    if (label) label.textContent = `${Math.round(pct)}%`;
  }

  syncStemConsoleControls(activePreset = '') {
    const effGains = this.stemMixer.getEffectiveGains();
    const activeKeys = this.stemMixer.getActiveTrackKeys();

    for (const k of activeKeys) {
      const st = this.stemMixer.state[k];
      const muteBtn = document.getElementById(`stem-mute-${k}`);
      const soloBtn = document.getElementById(`stem-solo-${k}`);
      const fader = document.getElementById(`stem-fader-${k}`);
      const gainLbl = document.getElementById(`stem-gain-${k}`);
      const strip = document.getElementById(`stem-strip-${k}`);

      if (muteBtn && st) muteBtn.classList.toggle('active', st.muted);
      if (soloBtn && st) soloBtn.classList.toggle('active', st.solo);
      if (fader && st) fader.value = String(Math.round(st.volume * 100));
      if (gainLbl && st) gainLbl.textContent = `${Math.round(st.volume * 100)}%`;
      if (strip) strip.classList.toggle('is-muted', (effGains[k] || 0) === 0);
    }

    document.querySelectorAll('[data-stem-preset]').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.stemPreset === activePreset);
    });

    const timeEl = document.getElementById('stemMixTimeText');
    if (timeEl) {
      timeEl.textContent = `${this.formatDuration(this.stemMixer.getCurrentTime())} / ${this.formatDuration(this.stemMixer.duration)}`;
    }
  }

  onStemMixerTick({ currentTime, duration, isPlaying, levels }) {
    const scrubber = document.getElementById('stemMixScrubber');
    const timeEl = document.getElementById('stemMixTimeText');

    if (scrubber && duration > 0) {
      scrubber.value = String(Math.round((currentTime / duration) * 1000));
    }
    if (timeEl) {
      timeEl.textContent = `${this.formatDuration(currentTime)} / ${this.formatDuration(duration)}`;
    }

    const activeKeys = this.stemMixer.getActiveTrackKeys();
    for (const k of activeKeys) {
      const meter = document.getElementById(`stem-meter-${k}`);
      if (meter) {
        const pct = Math.min(100, Math.round((levels[k] || 0) * 100));
        meter.style.width = `${pct}%`;
      }
    }

    const btn = document.getElementById('stemMixPlayBtn');
    if (btn) {
      btn.textContent = isPlaying ? '❚❚ Pause' : '▶ Play Mix';
    }
  }

  async downloadStemTrack(type, format = 'wav') {
    if (!this.activeStemsSong) return;
    const song = this.activeStemsSong;
    const cached = StorageManager.getCachedBuffer(song.uuid);
    if (!cached || !cached.stems || !cached.stems[type]) {
      this.showToast('Wait for neural stem separation to finish first.', 'amber');
      return;
    }

    const labelMap = {
      vocals: 'Vocals',
      lead_vocals: 'Lead Vocals',
      backing_vocals: 'Backing Harmonies',
      drums: 'Drums',
      bass: 'Bass',
      other: 'Melodies',
      instrumental: 'Instrumental'
    };
    const suffix = labelMap[type] || type;
    const stemBuffer = cached.stems[type];

    try {
      if (format === 'wav') {
        const wavBlob = AudioConverter.encodeWav(stemBuffer);
        const filename = this.makeSafeFilename(`${song.title} (${suffix})`, 'wav');
        this.triggerDownload(wavBlob, filename);
        this.showToast(`Downloaded ${suffix} Lossless WAV!`, 'emerald');
      } else {
        this.showToast(`Encoding ${suffix} 320k MP3 + ID3...`, 'emerald');
        const rawMp3 = await Mp3Encoder.encode(stemBuffer, 320);
        const taggedMp3 = await ID3Writer.embedTags(rawMp3, {
          title: `${song.title} (${suffix})`,
          artist: song.artist || 'Suno AI Studio',
          album: `${song.title} (Stems)`,
          genre: song.tags,
          lyrics: (type === 'vocals' || type === 'lead_vocals') ? song.prompt : '',
          coverUrl: song.imageLarge,
          coverBytes: song.customCoverBytes || null
        });
        const filename = this.makeSafeFilename(`${song.title} (${suffix})`, 'mp3');
        this.triggerDownload(taggedMp3, filename);
        this.showToast(`Downloaded Tagged ${suffix} MP3!`, 'emerald');
      }
    } catch (e) {
      this.showToast(`Stem export failed: ${e.message}`, 'rose');
    }
  }

  async exportCustomStemMix(format = 'wav') {
    if (!this.activeStemsSong || !this.stemMixer.stems) return;
    const song = this.activeStemsSong;

    try {
      const mixedBuffer = this.stemMixer.renderCustomMixBuffer();
      if (format === 'wav') {
        const wavBlob = AudioConverter.encodeWav(mixedBuffer);
        const filename = this.makeSafeFilename(`${song.title} (Custom Stem Mix)`, 'wav');
        this.triggerDownload(wavBlob, filename);
        this.showToast(`Exported Custom Stem Mix WAV!`, 'emerald');
      } else {
        this.showToast('Encoding Custom Stem Mix (320k MP3 + ID3)...', 'emerald');
        const rawMp3 = await Mp3Encoder.encode(mixedBuffer, 320);
        const taggedMp3 = await ID3Writer.embedTags(rawMp3, {
          title: `${song.title} (Custom Stem Mix)`,
          genre: song.tags,
          lyrics: song.prompt,
          coverUrl: song.imageLarge
        });
        const filename = this.makeSafeFilename(`${song.title} (Custom Stem Mix)`, 'mp3');
        this.triggerDownload(taggedMp3, filename);
        this.showToast(`Exported Custom Stem Mix MP3!`, 'emerald');
      }
    } catch (e) {
      this.showToast(`Custom mix export failed: ${e.message}`, 'rose');
    }
  }

  async downloadStemsZip(format = 'wav', mode = '2-stem') {
    if (!this.activeStemsSong) return;
    const song = this.activeStemsSong;
    const cached = StorageManager.getCachedBuffer(song.uuid);
    if (!cached || !cached.stems) return;

    const btnId = mode === '2-stem'
      ? (format === 'wav' ? 'btnZip2StemWav' : 'btnZip2StemMp3')
      : (format === 'wav' ? 'btnStemsZipWav' : 'btnStemsZipMp3');
    this.setBtnLoading(btnId, true, 'Packaging 0%...');

    try {
      const zipBlob = await ZipPackager.buildStemsZip(song, cached.stems, format, (pct, msg) => {
        this.setBtnLoading(btnId, true, `${pct}% ${msg.slice(0, 18)}...`);
      }, mode);

      const label = mode === '2-stem' ? '2-Stem Kit' : 'Neural Stems Kit';
      const filename = this.makeSafeFilename(`${song.title} - ${label} (${format.toUpperCase()})`, 'zip');
      this.triggerDownload(zipBlob, filename);
      this.showToast(`Downloaded ${label} ZIP: "${filename}"`, 'emerald');
    } catch (e) {
      this.showToast(`Stems ZIP failed: ${e.message}`, 'rose');
    } finally {
      this.setBtnLoading(btnId, false);
    }
  }

  async downloadAllStemsZip(format = 'wav') {
    const mode = (this.stemMixer && this.stemMixer.targetMode === '2-stem') ? '2-stem' : 'auto';
    return this.downloadStemsZip(format, mode);
  }

  /* =========================================================================
     STAGE 2 VOCAL DEMIXING (LEAD VS BACKING HARMONIES)
     ========================================================================= */

  async splitCurrentVocals() {
    if (!this.activeStemsSong) return;
    const currentBundle = this.stemMixer.stems;
    if (!currentBundle || !currentBundle.vocals) {
      this.showToast('Run HTDemucs stem separation first before splitting vocals.', 'amber');
      return;
    }

    const btn = document.getElementById('btnSplitVocals');
    const progCard = document.getElementById('stemsProgressCard');
    const progBar = document.getElementById('stemsProgressBar');
    const progText = document.getElementById('stemsStatusText');
    const progPct = document.getElementById('stemsProgressPct');

    if (btn) btn.disabled = true;
    if (progCard) progCard.style.display = 'flex';

    try {
      const { leadVocals, backingVocals, engine } = await StemEngine.splitLeadAndBackingVocals(
        currentBundle.vocals,
        (pct, stage) => {
          if (progBar) progBar.style.width = `${pct}%`;
          if (progPct) progPct.textContent = `${pct}%`;
          if (progText) progText.textContent = stage;
        }
      );

      currentBundle.lead_vocals = leadVocals;
      currentBundle.backing_vocals = backingVocals;

      // Update mixer & display strips
      this.stemMixer.loadStems(currentBundle, true);
      this.stemMixer.setVocalSplit(true);
      this.syncStemConsoleControls('full');

      const stripVocals = document.getElementById('stem-strip-vocals');
      const stripLead = document.getElementById('stem-strip-lead_vocals');
      const stripBacking = document.getElementById('stem-strip-backing_vocals');

      if (stripVocals) stripVocals.style.display = 'none';
      if (stripLead) stripLead.style.display = 'flex';
      if (stripBacking) stripBacking.style.display = 'flex';

      if (btn) {
        btn.textContent = '✓ Split (Lead & Backing)';
        btn.classList.remove('btn-cyan');
        btn.classList.add('btn-secondary');
      }

      const activeBadge = document.getElementById('stemActiveEngineBadge');
      if (activeBadge) {
        activeBadge.textContent = `6 Stems (${engine})`;
      }

      this.showToast('Separated Lead Vocals and Backing Harmonies!', 'emerald');
    } catch (err) {
      this.showToast(`Vocal split failed: ${err.message}`, 'rose');
    } finally {
      if (btn) btn.disabled = false;
      if (progCard) progCard.style.display = 'none';
    }
  }

  /* =========================================================================
     METADATA & ID3 TAG EDITOR (INDIVIDUAL & BATCH)
     ========================================================================= */

  openMetaModal(uuid) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    this.activeMetaSong = song;
    this.tempCoverDataUrl = song.customCoverDataUrl || null;

    document.getElementById('editMetaUuid').value = song.uuid;
    document.getElementById('editMetaTitle').value = song.title || '';
    document.getElementById('editMetaArtist').value = song.artist || 'Suno AI Studio';
    document.getElementById('editMetaAlbum').value = song.album || 'NTK Hub';
    document.getElementById('editMetaTrack').value = song.trackNumber || '';
    document.getElementById('editMetaYear').value = song.year || String(new Date().getFullYear());
    document.getElementById('editMetaGenre').value = song.tags || '';
    document.getElementById('editMetaLyrics').value = song.prompt || '';

    const preview = document.getElementById('editMetaCoverPreview');
    if (preview) {
      preview.src = song.customCoverDataUrl || song.imageLarge || 'assets/icon.svg';
    }

    const modal = document.getElementById('metaModal');
    if (modal) modal.classList.add('open');
  }

  async handleCustomCoverUpload(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      const base64Url = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      this.pendingUncroppedImage = {
        dataUrl: base64Url,
        target: 'metaCover',
        fileName: file.name
      };

      await this.imageCropper.open({
        imageSource: base64Url,
        targetType: 'cover',
        aspectRatio: '1:1',
        title: 'Crop Album Artwork / Thumbnail',
        onApply: (cropped) => {
          this.tempCoverDataUrl = cropped.dataUrl;
          const preview = document.getElementById('editMetaCoverPreview');
          if (preview) {
            preview.src = cropped.dataUrl;
          }
          this.showToast(`Applied cropped cover artwork (${cropped.width}×${cropped.height}px).`, 'emerald');
        },
        onCancel: () => {
          this.showToast('Cover crop cancelled.', 'slate');
        }
      });
    } catch (err) {
      this.showToast(`Error reading image: ${err.message}`, 'rose');
    } finally {
      event.target.value = '';
    }
  }

  async applyUncroppedImage() {
    if (!this.pendingUncroppedImage) {
      if (this.imageCropper) this.imageCropper.close();
      return;
    }

    const { dataUrl, target, fileName } = this.pendingUncroppedImage;
    if (this.imageCropper) this.imageCropper.close();

    if (target === 'metaCover') {
      this.tempCoverDataUrl = dataUrl;
      const preview = document.getElementById('editMetaCoverPreview');
      if (preview) preview.src = dataUrl;
      this.showToast('Applied full untouched cover artwork.', 'emerald');
    } else if (target === 'videoBg' && this.videoStudio) {
      await this.videoStudio.setCustomBackground(dataUrl);
      const bgStatus = document.getElementById('videoBgStatusText');
      const clearBtn = document.getElementById('btnClearVideoBg');
      if (bgStatus) bgStatus.textContent = `Custom Backdrop: ${fileName || 'Image'}`;
      if (clearBtn) clearBtn.style.display = 'inline-block';
      this.saveVideoStudioSettings();
      this.redrawStaticVideoPreview();
      this.showToast('Applied full untouched background image!', 'emerald');
    } else if (target === 'videoArt' && this.videoStudio) {
      await this.videoStudio.setCustomCover(dataUrl);
      const statusEl = document.getElementById('videoArtStatusText');
      const clearBtn = document.getElementById('btnClearVideoArt');
      if (statusEl) statusEl.textContent = `Custom Artwork: ${fileName || 'Image'}`;
      if (clearBtn) clearBtn.style.display = 'inline-block';
      this.saveVideoStudioSettings();
      this.redrawStaticVideoPreview();
      this.showToast('Applied full untouched album artwork!', 'emerald');
    }

    this.pendingUncroppedImage = null;
  }

  saveMetaModal() {
    const uuid = document.getElementById('editMetaUuid').value;
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    song.title = document.getElementById('editMetaTitle').value.trim() || song.title;
    song.artist = document.getElementById('editMetaArtist').value.trim() || 'Suno AI Studio';
    song.album = document.getElementById('editMetaAlbum').value.trim() || 'NTK Hub';
    song.trackNumber = document.getElementById('editMetaTrack').value.trim();
    song.year = document.getElementById('editMetaYear').value.trim() || String(new Date().getFullYear());
    song.tags = document.getElementById('editMetaGenre').value.trim();
    song.prompt = document.getElementById('editMetaLyrics').value.trim();

    if (this.tempCoverDataUrl) {
      song.customCoverDataUrl = this.tempCoverDataUrl;
    }

    StorageManager.upsertSong(song);
    this.renderSongs();

    const modal = document.getElementById('metaModal');
    if (modal) modal.classList.remove('open');
    this.showToast(`Saved metadata tags for "${song.title}"!`, 'emerald');
  }

  openBatchMetaModal() {
    const songs = StorageManager.loadSongs();
    if (songs.length === 0) {
      this.showToast('Your studio deck is empty. Add songs first!', 'amber');
      return;
    }

    const first = songs[0];
    document.getElementById('batchAlbum').value = first.album || (songs.length > 1 ? 'Suno Studio Collection' : first.title);
    document.getElementById('batchArtist').value = first.artist || 'Suno AI Studio';
    document.getElementById('batchYear').value = first.year || String(new Date().getFullYear());
    document.getElementById('batchGenre').value = first.tags || '';

    const modal = document.getElementById('batchMetaModal');
    if (modal) modal.classList.add('open');
  }

  saveBatchMetaModal() {
    const songs = StorageManager.loadSongs();
    if (songs.length === 0) return;

    const album = document.getElementById('batchAlbum').value.trim();
    const artist = document.getElementById('batchArtist').value.trim();
    const year = document.getElementById('batchYear').value.trim();
    const genre = document.getElementById('batchGenre').value.trim();
    const autoNumber = document.getElementById('batchAutoNumber').checked;

    for (let i = 0; i < songs.length; i++) {
      const s = songs[i];
      if (album) s.album = album;
      if (artist) s.artist = artist;
      if (year) s.year = year;
      if (genre) s.tags = genre;
      if (autoNumber) {
        s.trackNumber = `${String(i + 1).padStart(2, '0')}/${String(songs.length).padStart(2, '0')}`;
      }
      StorageManager.upsertSong(s);
    }

    this.renderSongs();
    const modal = document.getElementById('batchMetaModal');
    if (modal) modal.classList.remove('open');
    this.showToast(`Applied custom tags across all ${songs.length} tracks!`, 'emerald');
  }

  /* =========================================================================
     BULK DOWNLOAD ALL TRACKS (SINGLE .ZIP ARCHIVE)
     ========================================================================= */

  openBulkDownloadModal() {
    const songs = StorageManager.loadSongs();
    if (songs.length === 0) {
      this.showToast('Your studio deck is empty. Add songs or a playlist link first!', 'amber');
      return;
    }
    const modal = document.getElementById('bulkDownloadModal');
    if (modal) {
      const wrap = document.getElementById('bulkDownloadProgressWrap');
      if (wrap) wrap.style.display = 'none';
      const btn = document.getElementById('btnStartBulkDownload');
      if (btn) btn.disabled = false;
      modal.classList.add('open');
    }
  }

  async startBulkDownload() {
    const songs = StorageManager.loadSongs();
    if (songs.length === 0) return;

    const radio = document.querySelector('input[name="bulkFormatRadio"]:checked');
    const format = radio ? radio.value : 'mp3';

    const btn = document.getElementById('btnStartBulkDownload');
    const wrap = document.getElementById('bulkDownloadProgressWrap');
    const bar = document.getElementById('bulkDownloadProgressBar');
    const statusText = document.getElementById('bulkDownloadStatusText');
    const pctText = document.getElementById('bulkDownloadProgressPct');

    if (btn) btn.disabled = true;
    if (wrap) wrap.style.display = 'block';

    try {
      const commonAlbum = songs[0]?.album || 'Suno Studio Collection';
      const zipBlob = await ZipPackager.buildBatchDeckZip(
        songs,
        (uuid, stCb) => this.getDecryptedAudio(uuid, stCb),
        format,
        (pct, text) => {
          if (bar) bar.style.width = `${pct}%`;
          if (pctText) pctText.textContent = `${pct}%`;
          if (statusText) statusText.textContent = text;
        },
        { albumName: commonAlbum }
      );

      const safeAlbum = this.makeSafeFilename(commonAlbum.replace(/\s+/g, '_'), 'zip');
      const filename = `Suno_Batch_${songs.length}_Tracks_${format.toUpperCase()}_${safeAlbum}`;
      this.triggerDownload(zipBlob, filename);
      this.showToast(`Downloaded Batch ZIP (${songs.length} tracks): "${filename}"!`, 'emerald');

      const modal = document.getElementById('bulkDownloadModal');
      if (modal) modal.classList.remove('open');
    } catch (err) {
      this.showToast(`Bulk download error: ${err.message}`, 'rose');
      if (statusText) statusText.textContent = `Error: ${err.message}`;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* =========================================================================
     WAVEFORM AUDIO TRIMMER & MASTERING FX STUDIO
     ========================================================================= */

  setupTrimCanvasInteractions() {
    const canvas = document.getElementById('trimWaveCanvas');
    if (!canvas) return;

    let draggingHandle = null; // 'start' | 'end'

    const updateFromClientX = (clientX) => {
      if (!this.trimState.duration) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const sec = Number((ratio * this.trimState.duration).toFixed(1));

      if (!draggingHandle) {
        const distStart = Math.abs(sec - this.trimState.startSec);
        const distEnd = Math.abs(sec - this.trimState.endSec);
        draggingHandle = distStart <= distEnd ? 'start' : 'end';
      }

      if (draggingHandle === 'start') {
        this.trimState.startSec = Math.min(sec, Math.max(0, this.trimState.endSec - 0.5));
      } else {
        this.trimState.endSec = Math.max(sec, Math.min(this.trimState.duration, this.trimState.startSec + 0.5));
      }

      this.stopFxPreview();
      this.syncTrimControlsUI();
      this.drawTrimWaveform();
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.trimState.duration) return;
      draggingHandle = null;
      canvas.setPointerCapture(e.pointerId);
      updateFromClientX(e.clientX);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!draggingHandle) return;
      updateFromClientX(e.clientX);
    });

    const endDrag = () => {
      draggingHandle = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  }

  async openTrimFxStudio(uuid) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    this.player.pause();
    this.stopAllModalAudio();
    this.activeTrimSong = song;

    const modal = document.getElementById('trimFxModal');
    if (!modal) return;
    modal.classList.add('open');

    const titleEl = document.getElementById('trimModalTitle');
    const banner = document.getElementById('trimStatusBanner');
    if (titleEl) titleEl.textContent = `Trim & Mastering FX: ${song.title}`;
    if (banner) {
      banner.style.display = 'flex';
      banner.textContent = '⏳ Decoding master waveform...';
    }

    try {
      const { audioBuffer } = await this.getDecryptedAudio(uuid, (st) => {
        if (banner) banner.textContent = st;
      });

      const dur = Number(audioBuffer.duration.toFixed(1));
      const peaks = AudioConverter.computePeaks(audioBuffer, 220);

      this.trimState = {
        duration: dur,
        startSec: 0,
        endSec: dur,
        fadeInSec: 0,
        fadeOutSec: 0,
        preset: 'clean',
        peaks,
        audioBuffer
      };

      const startSlider = document.getElementById('trimStartRange');
      const endSlider = document.getElementById('trimEndRange');
      if (startSlider) {
        startSlider.max = String(dur);
        startSlider.value = '0';
      }
      if (endSlider) {
        endSlider.max = String(dur);
        endSlider.value = String(dur);
      }

      const fadeInSlider = document.getElementById('trimFadeInRange');
      const fadeOutSlider = document.getElementById('trimFadeOutRange');
      if (fadeInSlider) fadeInSlider.value = '0';
      if (fadeOutSlider) fadeOutSlider.value = '0';

      if (banner) banner.style.display = 'none';
      this.selectFxPreset('clean');
      this.syncTrimControlsUI();
      this.drawTrimWaveform();
    } catch (e) {
      if (banner) banner.textContent = `❌ Error: ${e.message}`;
      this.showToast(`Could not open Trim & FX Studio: ${e.message}`, 'rose');
    }
  }

  setQuickTrim(mode) {
    if (!this.trimState.duration) return;
    this.stopFxPreview();
    const dur = this.trimState.duration;

    if (mode === '30s') {
      this.trimState.startSec = 0;
      this.trimState.endSec = Math.min(dur, 30);
    } else if (mode === '15s') {
      this.trimState.startSec = 0;
      this.trimState.endSec = Math.min(dur, 15);
    } else {
      this.trimState.startSec = 0;
      this.trimState.endSec = dur;
    }

    this.syncTrimControlsUI();
    this.drawTrimWaveform();
  }

  onTrimSliderChange(which, val) {
    if (!this.trimState.duration) return;
    this.stopFxPreview();
    const num = Number(val);

    if (which === 'start') {
      this.trimState.startSec = Math.min(num, Math.max(0, this.trimState.endSec - 0.5));
    } else {
      this.trimState.endSec = Math.max(num, Math.min(this.trimState.duration, this.trimState.startSec + 0.5));
    }

    this.syncTrimControlsUI();
    this.drawTrimWaveform();
  }

  onTrimFadeChange() {
    this.stopFxPreview();
    const fi = Number(document.getElementById('trimFadeInRange')?.value || 0);
    const fo = Number(document.getElementById('trimFadeOutRange')?.value || 0);
    this.trimState.fadeInSec = fi;
    this.trimState.fadeOutSec = fo;
    this.syncTrimControlsUI();
    this.drawTrimWaveform();
  }

  selectFxPreset(presetId) {
    this.stopFxPreview();
    this.trimState.preset = presetId;
    document.querySelectorAll('.fx-preset-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.fx === presetId);
    });
  }

  syncTrimControlsUI() {
    const { startSec, endSec, fadeInSec, fadeOutSec } = this.trimState;
    const clipLen = Math.max(0, endSec - startSec);

    const startSlider = document.getElementById('trimStartRange');
    const endSlider = document.getElementById('trimEndRange');
    if (startSlider) startSlider.value = String(startSec);
    if (endSlider) endSlider.value = String(endSec);

    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const rem = (s % 60).toFixed(1);
      return `${m}:${Number(rem) < 10 ? '0' : ''}${rem}`;
    };

    const setTxt = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    setTxt('trimInLabel', fmt(startSec));
    setTxt('trimOutLabel', fmt(endSec));
    setTxt('trimLenLabel', fmt(clipLen));
    setTxt('trimStartVal', `${startSec.toFixed(1)}s`);
    setTxt('trimEndVal', `${endSec.toFixed(1)}s`);
    setTxt('trimFadeInVal', `${fadeInSec.toFixed(1)}s`);
    setTxt('trimFadeOutVal', `${fadeOutSec.toFixed(1)}s`);
  }

  drawTrimWaveform() {
    const canvas = document.getElementById('trimWaveCanvas');
    if (!canvas || !this.trimState.peaks || !this.trimState.duration) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const { peaks, duration, startSec, endSec, fadeInSec, fadeOutSec } = this.trimState;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090b12';
    ctx.fillRect(0, 0, w, h);

    const startX = (startSec / duration) * w;
    const endX = (endSec / duration) * w;

    // Highlight active selected region
    const regionGrad = ctx.createLinearGradient(startX, 0, endX, 0);
    regionGrad.addColorStop(0, 'rgba(16, 185, 129, 0.16)');
    regionGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.14)');
    regionGrad.addColorStop(1, 'rgba(245, 158, 11, 0.18)');
    ctx.fillStyle = regionGrad;
    ctx.fillRect(startX, 0, Math.max(2, endX - startX), h);

    // Draw waveform bars
    const n = peaks.length;
    const barW = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * barW;
      const inRange = x >= startX && x <= endX;
      const amp = Math.max(0.06, peaks[i]);
      const barH = amp * (h * 0.8);
      const y = (h - barH) / 2;

      ctx.fillStyle = inRange ? '#fbbf24' : 'rgba(100, 116, 139, 0.28)';
      ctx.fillRect(x + 0.8, y, Math.max(1.2, barW - 1.6), barH);
    }

    // Fade-in & Fade-out visual envelopes
    if (fadeInSec > 0) {
      const fiW = Math.min((endX - startX) * 0.48, (fadeInSec / duration) * w);
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, h - 6);
      ctx.lineTo(startX + fiW, 10);
      ctx.stroke();
    }
    if (fadeOutSec > 0) {
      const foW = Math.min((endX - startX) * 0.48, (fadeOutSec / duration) * w);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(endX - foW, 10);
      ctx.lineTo(endX, h - 6);
      ctx.stroke();
    }

    // IN Handle
    ctx.fillStyle = '#10b981';
    ctx.fillRect(startX - 2, 0, 4, h);
    ctx.beginPath();
    ctx.roundRect(Math.max(0, startX - 16), 4, 32, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#052e16';
    ctx.font = '800 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('IN', Math.max(16, startX), 16);

    // OUT Handle
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(endX - 2, 0, 4, h);
    ctx.beginPath();
    ctx.roundRect(Math.min(w - 36, endX - 18), h - 22, 36, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#451a03';
    ctx.fillText('OUT', Math.min(w - 18, endX), h - 10);
  }

  stopFxPreview() {
    if (this.fxPreviewSource) {
      try { this.fxPreviewSource.stop(); } catch (e) {}
      try { this.fxPreviewSource.disconnect(); } catch (e) {}
      this.fxPreviewSource = null;
    }
    const btn = document.getElementById('btnPreviewFx');
    if (btn) btn.textContent = '▶ Audition Processed Mix';
  }

  async renderActiveFxBuffer() {
    if (!this.trimState.audioBuffer) throw new Error('Audio buffer is not loaded.');
    const normalize = document.getElementById('trimNormalizeChk')?.checked !== false;

    return await AudioFXEngine.process(this.trimState.audioBuffer, {
      startSec: this.trimState.startSec,
      endSec: this.trimState.endSec,
      fadeInSec: this.trimState.fadeInSec,
      fadeOutSec: this.trimState.fadeOutSec,
      normalize,
      preset: this.trimState.preset
    });
  }

  async toggleFxPreview() {
    if (this.fxPreviewSource) {
      this.stopFxPreview();
      return;
    }

    const btn = document.getElementById('btnPreviewFx');
    if (btn) btn.textContent = '⏳ Rendering FX...';

    try {
      const processed = await this.renderActiveFxBuffer();
      const ctx = AudioConverter.getAudioContext();
      const src = ctx.createBufferSource();
      src.buffer = processed;
      src.connect(ctx.destination);
      src.onended = () => {
        if (this.fxPreviewSource === src) {
          this.fxPreviewSource = null;
          if (btn) btn.textContent = '▶ Audition Processed Mix';
        }
      };
      this.fxPreviewSource = src;
      src.start(0);
      if (btn) btn.textContent = '⏹ Stop Audition';
    } catch (e) {
      this.stopFxPreview();
      this.showToast(`FX preview failed: ${e.message}`, 'rose');
    }
  }

  async exportProcessedFx(format = 'mp3') {
    if (!this.activeTrimSong || !this.trimState.audioBuffer) return;
    this.stopFxPreview();

    const song = this.activeTrimSong;
    const presetMeta = AudioFXEngine.PRESETS.find((p) => p.id === this.trimState.preset) || AudioFXEngine.PRESETS[0];
    const suffix = this.trimState.preset === 'clean' ? 'Trimmed' : presetMeta.label;
    const btnId = format === 'wav' ? 'btnExportFxWav' : 'btnExportFxMp3';

    this.setBtnLoading(btnId, true, 'Mastering...');
    try {
      const processed = await this.renderActiveFxBuffer();

      if (format === 'wav') {
        const wavBlob = AudioConverter.encodeWav(processed);
        const filename = this.makeSafeFilename(`${song.title} (${suffix})`, 'wav');
        this.triggerDownload(wavBlob, filename);
        this.showToast(`Exported Mastered WAV: "${filename}"!`, 'emerald');
      } else {
        this.setBtnLoading(btnId, true, 'MP3 0%...');
        const rawMp3 = await Mp3Encoder.encode(processed, 320, (pct) => {
          this.setBtnLoading(btnId, true, `MP3 ${pct}%`);
        });
        const tagged = await ID3Writer.embedTags(rawMp3, {
          title: `${song.title} (${suffix})`,
          genre: song.tags,
          lyrics: song.prompt,
          coverUrl: song.imageLarge
        });
        const filename = this.makeSafeFilename(`${song.title} (${suffix})`, 'mp3');
        this.triggerDownload(tagged, filename);
        this.showToast(`Exported Mastered 320k MP3: "${filename}"!`, 'emerald');
      }
    } catch (e) {
      this.showToast(`Mastering export failed: ${e.message}`, 'rose');
    } finally {
      this.setBtnLoading(btnId, false);
    }
  }

  /* =========================================================================
     KARAOKE VIDEO & VISUALIZER STUDIO
     ========================================================================= */

  /* =========================================================================
     WORLD-CLASS VIDEO STUDIO & CUSTOMIZATION SUITE
     ========================================================================= */

  loadVideoStudioSettings() {
    const defaultSettings = {
      studioName: 'NTK Hub',
      studioSubtitle: 'Official Visualizer',
      watermarkPos: 'top-left',
      customBgDataUrl: null,
      bgDimOpacity: 0.40,
      bgBlurPx: 20,
      bgMotion: 'ken-burns',
      slideTransition: 'crossfade',
      artMode: 'card',
      artSizeScale: 0.44,
      artCornerRadius: 28,
      artGlowIntensity: 0.70,
      visualStyle: 'bars',
      showVisualizer: true,
      vizPosition: 'below_artwork',
      vizWidthPercent: 0.74,
      vizMaxHeight: 120,
      theme: 'sunset',
      customColors: null,
      showParticles: true,
      customCoverDataUrl: null,
      lyricAnimation: 'capcut_bounce',
      showFooter: true,
      fontFamily: 'Inter',
      lyricPosition: 'lower-third',
      aspectRatio: '1:1',
      resolution: '1080p',
      fps: 60,
      bitrateMbps: 12,
      customPositions: null,
      particleStyle: 'dust',
      particleSpeed: 1.0,
      isAdMode: false,
      adConfig: {
        topHookText: '',
        bottomCtaText: '',
        urgencyBadge: '',
        ctaStyle: 'pulsing_pill'
      }
    };

    try {
      const stored = localStorage.getItem('suno_video_studio_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.studioName === 'NTK Studios') {
          parsed.studioName = 'NTK Hub';
        }
        return { ...defaultSettings, ...parsed };
      }
    } catch (e) {}
    return defaultSettings;
  }

  saveVideoStudioSettings() {
    if (!this.videoStudio) return;
    try {
      const settings = {
        studioName: this.videoStudio.studioName,
        studioSubtitle: this.videoStudio.studioSubtitle,
        watermarkPos: this.videoStudio.watermarkPos,
        customBgDataUrl: this.videoStudio.customBgDataUrl,
        bgDimOpacity: this.videoStudio.bgDimOpacity,
        bgBlurPx: this.videoStudio.bgBlurPx,
        bgMotion: this.videoStudio.bgMotion,
        slideTransition: this.videoStudio.slideTransition || 'crossfade',
        artMode: this.videoStudio.artMode,
        artSizeScale: this.videoStudio.artSizeScale,
        artCornerRadius: this.videoStudio.artCornerRadius,
        artGlowIntensity: this.videoStudio.artGlowIntensity,
        visualStyle: this.videoStudio.visualStyle,
        showVisualizer: this.videoStudio.showVisualizer !== false,
        vizPosition: this.videoStudio.vizPosition || 'below_artwork',
        vizWidthPercent: this.videoStudio.vizWidthPercent || 0.74,
        vizMaxHeight: this.videoStudio.vizMaxHeight || 120,
        theme: this.videoStudio.theme,
        customColors: this.videoStudio.customColors,
        showParticles: this.videoStudio.showParticles,
        customCoverDataUrl: this.videoStudio.customCoverDataUrl,
        lyricAnimation: this.videoStudio.lyricAnimation,
        showFooter: this.videoStudio.showFooter,
        fontFamily: this.videoStudio.fontFamily,
        lyricPosition: this.videoStudio.lyricPosition,
        aspectRatio: this.videoStudio.aspectRatio,
        resolution: this.videoStudio.resolution || '1080p',
        fps: this.videoStudio.fps,
        bitrateMbps: this.videoStudio.bitrateMbps,
        customPositions: this.videoStudio.customPositions || null,
        particleStyle: this.videoStudio.particleStyle || 'dust',
        particleSpeed: this.videoStudio.particleSpeed || 1.0,
        isAdMode: !!this.videoStudio.isAdMode,
        adConfig: this.videoStudio.adConfig || null
      };
      for (const key of ['lyricStrokeWidth','lyricStrokeColor','lyricScrimEnabled','lyricScrimOpacity','watermarkLogoDataUrl','watermarkLogoSize','watermarkLogoOpacity','vizSensitivity','slideDurationSec','slideTransitionSec','audioSourceType']) settings[key] = this.videoStudio[key];
      localStorage.setItem('suno_video_studio_settings', JSON.stringify(settings));
    } catch (e) {}
  }

  async openVideoStudio(uuid) {
    const openRequest = {};
    this._studioOpenRequest = openRequest;
    let song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    // Proactively enrich metadata and lyrics if missing or using placeholder title
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(song.uuid) && (!song.prompt || (song.title && song.title.startsWith('Suno_Song_')))) {
      try {
        const freshMeta = await SunoAPI.fetchMetadata(song.uuid);
        if (freshMeta) {
          let updated = false;
          if (freshMeta.title && !freshMeta.title.startsWith('Suno_Song_')) {
            song.title = freshMeta.title;
            updated = true;
          }
          if (freshMeta.prompt && freshMeta.prompt.trim()) {
            song.prompt = freshMeta.prompt.trim();
            updated = true;
          }
          if (freshMeta.tags) song.tags = freshMeta.tags;
          if (freshMeta.duration) song.duration = freshMeta.duration;
          if (freshMeta.artist) song.artist = freshMeta.artist;
          if (updated) {
            const allSongs = StorageManager.loadSongs();
            const idx = allSongs.findIndex((s) => s.uuid === song.uuid);
            if (idx !== -1) {
              allSongs[idx] = { ...allSongs[idx], ...song };
              StorageManager.saveSongs(allSongs);
            }
            this.renderSongCards();
          }
        }
      } catch (e) {}
    }

    if (this._studioOpenRequest !== openRequest) return;
    this.player.pause();
    this.stopAllModalAudio();
    this._studioOpenRequest = openRequest;
    this.activeStudioSong = song;

    const modal = document.getElementById('videoStudioModal');
    if (!modal) return;
    modal.classList.add('open');

    const titleEl = document.getElementById('studioSongTitle');
    if (titleEl) titleEl.textContent = `Karaoke Video Studio: ${song.title}`;

    const settings = this.loadVideoStudioSettings();
    const canvas = document.getElementById('studioCanvas');
    const showLyrics = document.getElementById('chkVideoLyrics')?.checked !== false;

    this.videoStudio = new VideoGenerator({
      ...settings,
      canvas,
      aspectRatio: settings.aspectRatio,
      resolution: settings.resolution || '1080p',
      visualStyle: settings.visualStyle,
      showVisualizer: settings.showVisualizer !== false,
      vizPosition: settings.vizPosition || 'below_artwork',
      vizWidthPercent: settings.vizWidthPercent || 0.74,
      vizMaxHeight: settings.vizMaxHeight || 120,
      theme: settings.theme,
      customColors: settings.customColors,
      showLyrics,
      studioName: settings.studioName,
      studioSubtitle: settings.studioSubtitle,
      watermarkPos: settings.watermarkPos,
      customBgDataUrl: settings.customBgDataUrl,
      bgDimOpacity: settings.bgDimOpacity,
      bgBlurPx: settings.bgBlurPx,
      bgMotion: settings.bgMotion,
      slideTransition: settings.slideTransition || 'crossfade',
      showParticles: settings.showParticles,
      customCoverDataUrl: settings.customCoverDataUrl,
      lyricAnimation: settings.lyricAnimation,
      showFooter: settings.showFooter !== false,
      artMode: settings.artMode,
      artSizeScale: settings.artSizeScale,
      artCornerRadius: settings.artCornerRadius,
      artGlowIntensity: settings.artGlowIntensity,
      fontFamily: settings.fontFamily,
      lyricPosition: settings.lyricPosition,
      fps: settings.fps,
      bitrateMbps: settings.bitrateMbps,
      customPositions: settings.customPositions || null,
      particleStyle: settings.particleStyle || 'dust',
      particleSpeed: settings.particleSpeed || 1.0,
      isAdMode: !!settings.isAdMode,
      adConfig: settings.adConfig || null,
      songMeta: song
    });

    const studio = this.videoStudio;
    const stillOpen = () => this._studioOpenRequest === openRequest && this.videoStudio === studio && modal.classList.contains('open');
    if (canvas) {
      this.videoStudio.setupDragInteraction(canvas, (comp, pos) => {
        this.onVideoComponentMoved(comp, pos);
      });
    }

    // Populate UI inputs with saved settings
    const nameInput = document.getElementById('videoStudioName');
    if (nameInput) nameInput.value = settings.studioName;

    const subInput = document.getElementById('videoStudioSubtitle');
    if (subInput) subInput.value = settings.studioSubtitle;

    const wmSelect = document.getElementById('videoWatermarkPos');
    if (wmSelect) wmSelect.value = settings.watermarkPos;

    const chkFooter = document.getElementById('chkVideoFooter');
    if (chkFooter) chkFooter.checked = settings.showFooter !== false;

    const dimInput = document.getElementById('videoBgDim');
    const dimVal = document.getElementById('videoBgDimVal');
    if (dimInput) dimInput.value = Math.round(settings.bgDimOpacity * 100);
    if (dimVal) dimVal.textContent = `${Math.round(settings.bgDimOpacity * 100)}%`;

    const blurInput = document.getElementById('videoBgBlur');
    const blurVal = document.getElementById('videoBgBlurVal');
    if (blurInput) blurInput.value = settings.bgBlurPx;
    if (blurVal) blurVal.textContent = `${settings.bgBlurPx}px`;

    const motionSelect = document.getElementById('videoBgMotion');
    if (motionSelect) motionSelect.value = settings.bgMotion;

    const transSelect = document.getElementById('videoSlideTransition');
    if (transSelect) transSelect.value = settings.slideTransition || 'crossfade';

    const scaleInput = document.getElementById('videoArtScale');
    const scaleVal = document.getElementById('videoArtScaleVal');
    if (scaleInput) scaleInput.value = Math.round(settings.artSizeScale * 100);
    if (scaleVal) scaleVal.textContent = `${Math.round(settings.artSizeScale * 100)}%`;

    const cornersSelect = document.getElementById('videoArtCorners');
    if (cornersSelect) cornersSelect.value = String(settings.artCornerRadius);

    const glowInput = document.getElementById('videoArtGlow');
    const glowVal = document.getElementById('videoArtGlowVal');
    if (glowInput) glowInput.value = Math.round(settings.artGlowIntensity * 100);
    if (glowVal) glowVal.textContent = `${Math.round(settings.artGlowIntensity * 100)}%`;

    const fontSelect = document.getElementById('videoFontFamily');
    if (fontSelect) fontSelect.value = settings.fontFamily;

    const animSelect = document.getElementById('videoLyricAnimSelect');
    if (animSelect) animSelect.value = settings.lyricAnimation || 'capcut_bounce';

    const posSelect = document.getElementById('videoLyricPos');
    if (posSelect) posSelect.value = settings.lyricPosition;

    const fpsSelect = document.getElementById('videoFpsSelect');
    if (fpsSelect) fpsSelect.value = String(settings.fps);

    const bitSelect = document.getElementById('videoBitrateSelect');
    if (bitSelect) bitSelect.value = String(settings.bitrateMbps);

    const partChk = document.getElementById('videoShowParticles');
    if (partChk) partChk.checked = settings.showParticles;

    const chkPartEnabled = document.getElementById('chkParticlesEnabled');
    if (chkPartEnabled) chkPartEnabled.checked = settings.showParticles !== false;

    const particleSelect = document.getElementById('videoParticleStyle');
    if (particleSelect) particleSelect.value = settings.particleStyle || 'dust';

    const pSpeedInput = document.getElementById('videoParticleSpeed');
    const pSpeedVal = document.getElementById('videoParticleSpeedVal');
    if (pSpeedInput) pSpeedInput.value = settings.particleSpeed || 1.0;
    if (pSpeedVal) pSpeedVal.textContent = `${(settings.particleSpeed || 1.0).toFixed(1)}x`;

    const chkAd = document.getElementById('chkAdModeEnabled');
    if (chkAd) chkAd.checked = !!settings.isAdMode;

    const hookInput = document.getElementById('adTopHookInput');
    if (hookInput && settings.adConfig) hookInput.value = settings.adConfig.topHookText || '';

    const ctaInput = document.getElementById('adBottomCtaInput');
    if (ctaInput && settings.adConfig) ctaInput.value = settings.adConfig.bottomCtaText || '';

    const badgeSelect = document.getElementById('adUrgencyBadgeSelect');
    if (badgeSelect && settings.adConfig) badgeSelect.value = settings.adConfig.urgencyBadge || '';

    this.renderSlidesPreview();

    // Visualizer Controls Population
    const chkViz = document.getElementById('chkVideoVisualizer');
    if (chkViz) chkViz.checked = settings.showVisualizer !== false;

    const vizPosSelect = document.getElementById('videoVizPosition');
    if (vizPosSelect) vizPosSelect.value = settings.vizPosition || 'below_artwork';

    const vizWInput = document.getElementById('videoVizWidth');
    const vizWVal = document.getElementById('videoVizWidthVal');
    if (vizWInput) vizWInput.value = Math.round((settings.vizWidthPercent || 0.74) * 100);
    if (vizWVal) vizWVal.textContent = `${Math.round((settings.vizWidthPercent || 0.74) * 100)}%`;

    const vizHInput = document.getElementById('videoVizHeight');
    const vizHVal = document.getElementById('videoVizHeightVal');
    if (vizHInput) vizHInput.value = settings.vizMaxHeight || 120;
    if (vizHVal) vizHVal.textContent = `${settings.vizMaxHeight || 120}px`;

    // Reset button active states
    document.querySelectorAll('.ratio-btn').forEach((b) => b.classList.toggle('active', b.dataset.ratio === settings.aspectRatio));
    document.querySelectorAll('[data-vstyle]').forEach((b) => b.classList.toggle('active', b.dataset.vstyle === settings.visualStyle));
    document.querySelectorAll('[data-artmode]').forEach((b) => b.classList.toggle('active', b.dataset.artmode === settings.artMode));
    document.querySelectorAll('.theme-swatch-btn').forEach((b) => b.classList.toggle('active', b.dataset.vtheme === settings.theme));

    const activeRes = settings.resolution || '1080p';
    document.querySelectorAll('.res-btn').forEach((b) => b.classList.toggle('active', b.dataset.res === activeRes));
    const resBadge = document.getElementById('videoCanvasBadge');
    if (resBadge) {
      resBadge.textContent = activeRes === '1080p' ? '1080p Full HD' : (activeRes === '720p' ? '720p HD' : '480p Fast SD');
    }
    const renderBtnLabel = document.getElementById('renderBtnLabel');
    if (renderBtnLabel) {
      renderBtnLabel.textContent = `🎬 Render & Export ${activeRes.toUpperCase()} Video`;
    }

    const container = document.getElementById('canvasContainer');
    if (container) container.className = `canvas-container ratio-${settings.aspectRatio.replace(':', '-')}`;

    // Timeline Scrubber
    const scrubber = document.getElementById('videoTimelineScrubber');
    const timeText = document.getElementById('videoTimelineTime');
    if (scrubber) scrubber.value = 0;
    const dur = song.duration || 180;
    if (timeText) timeText.textContent = `0:00 / ${this.formatTime(dur)}`;

    this.videoStudio.setSongMeta(song, dur);
    this.videoStudio.updateCanvasDimensions();

    // Load artwork & custom background
    const bgStatus = document.getElementById('videoBgStatusText');
    const clearBgBtn = document.getElementById('btnClearVideoBg');

    if (settings.customBgDataUrl) {
      if (bgStatus) bgStatus.textContent = 'Custom Wallpaper Active';
      if (clearBgBtn) clearBgBtn.style.display = 'inline-block';
      await this.videoStudio.loadBackgroundImage(settings.customBgDataUrl);
      if (!stillOpen()) return;
    } else {
      if (bgStatus) bgStatus.textContent = 'Using Album Artwork Backdrop';
      if (clearBgBtn) clearBgBtn.style.display = 'none';
    }

    // Custom Album Artwork / Vinyl Label
    const artStatus = document.getElementById('videoArtStatusText');
    const clearArtBtn = document.getElementById('btnClearVideoArt');
    if (settings.customCoverDataUrl) {
      if (artStatus) artStatus.textContent = 'Custom Artwork Active';
      if (clearArtBtn) clearArtBtn.style.display = 'inline-block';
      await this.videoStudio.loadCustomCover(settings.customCoverDataUrl);
      if (!stillOpen()) return;
    } else {
      if (artStatus) artStatus.textContent = 'Using Song Artwork';
      if (clearArtBtn) clearArtBtn.style.display = 'none';
      await this.videoStudio.loadCustomCover(null);
      if (!stillOpen()) return;
    }

    // Lyrics & Cues
    const lyricsTextarea = document.getElementById('videoLyricsTextarea');
    const cuesBadge = document.getElementById('videoLyricCuesCount');
    const lyricsStatusText = document.getElementById('videoLyricsStatusText');
    const songPrompt = (song.customLyrics ?? song.prompt ?? '').trim();
    if (lyricsTextarea) lyricsTextarea.value = songPrompt;
    this.videoStudio.setCustomLyrics(songPrompt, dur, song.lyricTiming);
    if (cuesBadge) cuesBadge.textContent = `${this.videoStudio.lyricCues.length} cues`;
    if (lyricsStatusText) {
      lyricsStatusText.textContent = this.videoStudio.lyricCues.length > 0
        ? `Loaded ${this.videoStudio.lyricCues.length} cues ${song.customLyrics ? '(synced)' : 'from song'}`
        : 'Ready (paste or import lyrics)';
    }

    for (const [id, value] of Object.entries({
      videoLyricStrokeWidth: this.videoStudio.lyricStrokeWidth,
      videoLyricStrokeColor: this.videoStudio.lyricStrokeColor,
      videoLyricScrimOpacity: this.videoStudio.lyricScrimOpacity * 100,
      videoVizSensitivity: this.videoStudio.vizSensitivity,
      videoAudioSourceSelect: this.videoStudio.audioSourceType,
      videoSlideDurationMode: this.videoStudio.slideDurationSec || 'auto',
      videoSlideTransSpeed: this.videoStudio.slideTransitionSec,
      videoWatermarkLogoSize: this.videoStudio.watermarkLogoSize,
      videoWatermarkLogoOpacity: this.videoStudio.watermarkLogoOpacity * 100
    })) { const input = document.getElementById(id); if (input) input.value = value; }
    const scrimCheck = document.getElementById('chkVideoLyricScrim');
    if (scrimCheck) scrimCheck.checked = this.videoStudio.lyricScrimEnabled;
    if (this.videoStudio.watermarkLogoDataUrl) {
      await this.videoStudio.loadWatermarkLogo(this.videoStudio.watermarkLogoDataUrl);
      if (!stillOpen()) return;
      const logo = document.getElementById('watermarkLogoPreviewImg');
      if (logo) logo.src = this.videoStudio.watermarkLogoDataUrl;
      for (const id of ['watermarkLogoPreviewBox','watermarkLogoControls','btnClearWatermarkLogo']) {
        const el = document.getElementById(id); if (el) el.style.display = 'flex';
      }
    }
    await this.loadStudioAiSettings();
    if (!stillOpen()) return;

    await this.videoStudio.loadCoverImage(song.imageLarge);
    if (!stillOpen()) return;

    const resetBtn = document.getElementById('btnResetCanvasPositions');
    if (resetBtn) {
      const hasAny = this.videoStudio.customPositions && Object.values(this.videoStudio.customPositions).some((p) => p !== null);
      resetBtn.style.display = hasAny ? 'inline-flex' : 'none';
    }
    if (this.videoStudio.customPositions && this.videoStudio.customPositions.visualizer) {
      const vizPosSelect = document.getElementById('videoVizPosition');
      if (vizPosSelect) vizPosSelect.value = 'custom';
    }

    this.redrawStaticVideoPreview(0);
  }

  onVideoComponentMoved(comp, pos) {
    this.saveVideoStudioSettings();
    const resetBtn = document.getElementById('btnResetCanvasPositions');
    if (resetBtn) resetBtn.style.display = 'inline-flex';
    if (comp === 'visualizer') {
      const sel = document.getElementById('videoVizPosition');
      if (sel) sel.value = 'custom';
    }
  }

  resetVideoLayoutPositions(comp = null) {
    if (!this.videoStudio) return;
    this.videoStudio.resetCustomPositions(comp);
    this.saveVideoStudioSettings();
    const resetBtn = document.getElementById('btnResetCanvasPositions');
    if (resetBtn) {
      const hasAny = this.videoStudio.customPositions && Object.values(this.videoStudio.customPositions).some((p) => p !== null);
      resetBtn.style.display = hasAny ? 'inline-flex' : 'none';
    }
    const sel = document.getElementById('videoVizPosition');
    if (sel && sel.value === 'custom') {
      sel.value = this.videoStudio.vizPosition || 'below_artwork';
    }
    this.redrawStaticVideoPreview();
    this.showToast('Reset component layout positions to defaults.', 'amber');
  }

  switchVideoTab(tabName) {
    document.querySelectorAll('.studio-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.vtab === tabName);
    });
    document.querySelectorAll('.studio-tab-pane').forEach((p) => {
      p.classList.toggle('active', p.id === `vtab-${tabName}`);
    });
  }

  getCurrentVideoTime() {
    const scrubber = document.getElementById('videoTimelineScrubber');
    const dur = (this.activeStudioSong && this.activeStudioSong.duration) || 180;
    if (scrubber) {
      return (Number(scrubber.value) / 1000) * dur;
    }
    return 0;
  }

  redrawStaticVideoPreview(timeSec = null) {
    if (!this.videoStudio) return;
    const dur = (this.activeStudioSong && this.activeStudioSong.duration) || 180;
    const t = (timeSec !== null && timeSec !== undefined) ? timeSec : this.getCurrentVideoTime();
    this.videoStudio.renderStaticAtTime(t, dur);
  }

  scrubVideoTimeline(val) {
    if (!this.videoStudio) return;
    const scrubber = document.getElementById('videoTimelineScrubber');
    const cinemaScrubber = document.getElementById('cinemaTimelineScrubber');
    if (scrubber && String(scrubber.value) !== String(val)) {
      scrubber.value = val;
    }
    if (cinemaScrubber && String(cinemaScrubber.value) !== String(val)) {
      cinemaScrubber.value = val;
    }
    const dur = (this.activeStudioSong && this.activeStudioSong.duration) || 180;
    const currentSec = (Number(val) / 1000) * dur;
    const timeFormatted = `${this.formatTime(currentSec)} / ${this.formatTime(dur)}`;
    const timeText = document.getElementById('videoTimelineTime');
    const cinemaTime = document.getElementById('cinemaTimelineTime');
    if (timeText) timeText.textContent = timeFormatted;
    if (cinemaTime) cinemaTime.textContent = timeFormatted;

    if (this.videoStudio.isPreviewing) {
      this.videoStudio.seekPreview(currentSec);
    } else if (!this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview(currentSec);
    }
  }

  snapshotVideoFrame() {
    const canvas = document.getElementById('studioCanvas');
    if (!canvas || !this.activeStudioSong) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${this.makeSafeFilename(this.activeStudioSong.title, 'png')}`;
      link.href = dataUrl;
      link.click();
      this.showToast('Downloaded High-Res Frame Snapshot!', 'emerald');
    } catch (e) {
      this.showToast(`Snapshot failed: ${e.message}`, 'rose');
    }
  }

  applyVideoPreset(presetKey) {
    if (!this.videoStudio) return;
    this.videoStudio.applyPreset(presetKey);

    const particleSelect = document.getElementById('videoParticleStyle');
    if (particleSelect) particleSelect.value = this.videoStudio.particleStyle;

    const chkPartEnabled = document.getElementById('chkParticlesEnabled');
    if (chkPartEnabled) chkPartEnabled.checked = this.videoStudio.showParticles;

    const chkAd = document.getElementById('chkAdModeEnabled');
    if (chkAd) chkAd.checked = this.videoStudio.isAdMode;

    const animSelect = document.getElementById('videoLyricAnimSelect');
    if (animSelect) animSelect.value = this.videoStudio.lyricAnimation;

    const transSelect = document.getElementById('videoSlideTransition');
    if (transSelect && this.videoStudio.slideTransition) transSelect.value = this.videoStudio.slideTransition;

    const motionSelect = document.getElementById('videoBgMotion');
    if (motionSelect && this.videoStudio.bgMotion) motionSelect.value = this.videoStudio.bgMotion;

    const hookInput = document.getElementById('adTopHookInput');
    if (hookInput && this.videoStudio.adConfig) hookInput.value = this.videoStudio.adConfig.topHookText || '';

    const ctaInput = document.getElementById('adBottomCtaInput');
    if (ctaInput && this.videoStudio.adConfig) ctaInput.value = this.videoStudio.adConfig.bottomCtaText || '';

    const badgeSelect = document.getElementById('adUrgencyBadgeSelect');
    if (badgeSelect && this.videoStudio.adConfig) badgeSelect.value = this.videoStudio.adConfig.urgencyBadge || '';

    const container = document.getElementById('canvasContainer');
    if (container) {
      container.className = `canvas-container ratio-${this.videoStudio.aspectRatio.replace(':', '-')}`;
    }

    document.querySelectorAll('.ratio-btn').forEach((b) => b.classList.toggle('active', b.dataset.ratio === this.videoStudio.aspectRatio));
    document.querySelectorAll('[data-artmode]').forEach((b) => b.classList.toggle('active', b.dataset.artmode === this.videoStudio.artMode));
    document.querySelectorAll('.theme-swatch-btn').forEach((b) => b.classList.toggle('active', b.dataset.vtheme === this.videoStudio.theme));

    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
    this.showToast(`Applied preset: ${presetKey.replace(/_/g, ' ').toUpperCase()}`, 'cyan');
  }

  setVideoParticleStyle(style) {
    if (!this.videoStudio) return;
    this.videoStudio.setParticleStyle(style);
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  setVideoParticleSpeed(speed) {
    const val = parseFloat(speed) || 1.0;
    if (!this.videoStudio) return;
    this.videoStudio.setParticleSpeed(val);
    const lbl = document.getElementById('videoParticleSpeedVal');
    if (lbl) lbl.textContent = `${val.toFixed(1)}x`;
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  toggleAdMode(enabled) {
    if (!this.videoStudio) return;
    this.videoStudio.setAdMode(enabled);
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateAdConfig() {
    if (!this.videoStudio) return;
    const topHook = document.getElementById('adTopHookInput')?.value || '';
    const bottomCta = document.getElementById('adBottomCtaInput')?.value || '';
    let urgencyBadge = document.getElementById('adUrgencyBadgeSelect')?.value || '';
    if (urgencyBadge === 'custom') {
      urgencyBadge = document.getElementById('adCustomBadgeInput')?.value || '';
    }

    this.videoStudio.setAdConfig({
      topHookText: topHook,
      bottomCtaText: bottomCta,
      urgencyBadge: urgencyBadge
    });
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateAdBadgePreset(preset) {
    const customInput = document.getElementById('adCustomBadgeInput');
    if (preset === 'custom') {
      if (customInput) customInput.style.display = 'block';
    } else {
      if (customInput) customInput.style.display = 'none';
    }
    this.updateAdConfig();
  }

  async handleMultiSlideUpload(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      await this.addSlideFiles(files);
    }
    event.target.value = '';
  }

  onSlideDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    const zone = document.getElementById('multiSlideDropzone');
    if (zone) zone.classList.add('drag-active');
  }

  onSlideDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    const zone = document.getElementById('multiSlideDropzone');
    if (zone) zone.classList.remove('drag-active');
  }

  async onSlideDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const zone = document.getElementById('multiSlideDropzone');
    if (zone) zone.classList.remove('drag-active');
    const files = event.dataTransfer && event.dataTransfer.files;
    if (files && files.length > 0) {
      await this.addSlideFiles(files);
    }
  }

  async addSlideFiles(files) {
    if (!files || files.length === 0 || !this.videoStudio) return;

    const imageFiles = Array.from(files)
      .filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (imageFiles.length === 0) {
      this.showToast('No image files detected in drop.', 'amber');
      return;
    }

    this.showToast(`Loading ${imageFiles.length} photos into Storyteller...`, 'cyan');

    const loadPromises = imageFiles.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target.result;
          const img = new Image();
          img.onload = () => resolve({ img, dataUrl, name: file.name });
          img.onerror = () => resolve(null);
          img.src = dataUrl;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    });

    const loadedSlides = (await Promise.all(loadPromises)).filter(Boolean);

    loadedSlides.forEach((slide) => {
      this.videoStudio.addSlide(slide.img, slide.dataUrl);
    });

    this.renderSlidesPreview();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }

    const total = this.videoStudio.slides.length;
    const dur = (this.activeStudioSong && this.activeStudioSong.duration) || 180;
    const perSlideSec = (dur / total).toFixed(1);
    this.showToast(`Added ${loadedSlides.length} photos (${total} total in deck, ~${perSlideSec}s each)!`, 'emerald');
  }

  clearMultiSlides() {
    if (!this.videoStudio) return;
    this.videoStudio.clearSlides();
    this.renderSlidesPreview();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
    this.showToast('Cleared Storyteller photos.', 'amber');
  }

  removeMultiSlide(idx) {
    if (!this.videoStudio || !this.videoStudio.slides) return;
    this.videoStudio.slides.splice(idx, 1);
    this.renderSlidesPreview();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  moveMultiSlide(idx, direction) {
    if (!this.videoStudio || !this.videoStudio.slides) return;
    const slides = this.videoStudio.slides;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= slides.length) return;
    const temp = slides[idx];
    slides[idx] = slides[targetIdx];
    slides[targetIdx] = temp;
    this.renderSlidesPreview();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateSlideDurationSettings() {
    if (!this.videoStudio) return;
    const mode = document.getElementById('videoSlideDurationMode')?.value || 'auto';
    const durSec = mode === 'auto' ? 0 : Number(mode);
    const speed = Number(document.getElementById('videoSlideTransSpeed')?.value) || 1.2;
    const speedVal = document.getElementById('videoSlideTransSpeedVal');
    if (speedVal) speedVal.textContent = `${speed.toFixed(1)}s`;
    this.videoStudio.setSlideDurationSettings(durSec, speed);
    this.saveVideoStudioSettings();
  }

  renderSlidesPreview() {
    const row = document.getElementById('slidesPreviewRow');
    const badge = document.getElementById('slideCountBadge');
    const btnClear = document.getElementById('btnClearSlides');
    const timingPill = document.getElementById('slideTimingPill');
    if (!row || !this.videoStudio) return;

    const slides = this.videoStudio.slides || [];
    const dur = (this.activeStudioSong && this.activeStudioSong.duration) || 180;
    const perSlideSec = slides.length > 0 ? (dur / slides.length).toFixed(1) : 0;

    if (badge) badge.textContent = `${slides.length} photo${slides.length === 1 ? '' : 's'}`;
    if (btnClear) btnClear.style.display = slides.length > 0 ? 'inline-block' : 'none';
    if (timingPill) {
      timingPill.style.display = slides.length > 0 ? 'inline-block' : 'none';
      timingPill.textContent = `⏱ ~${perSlideSec}s per photo`;
    }

    if (slides.length === 0) {
      row.style.display = 'none';
      row.innerHTML = '';
      return;
    }

    row.style.display = 'flex';
    row.innerHTML = slides.map((s, i) => `
      <div class="slide-thumb" title="Photo #${i + 1} (~${perSlideSec}s across song)">
        <img src="${s.dataUrl || s.img?.src}" alt="Photo ${i + 1}" />
        <span class="slide-idx">#${i + 1}</span>
        ${i > 0 ? `<button type="button" class="slide-btn-nav slide-btn-left" onclick="app.moveMultiSlide(${i}, -1)" title="Move earlier">◀</button>` : ''}
        ${i < slides.length - 1 ? `<button type="button" class="slide-btn-nav slide-btn-right" onclick="app.moveMultiSlide(${i}, 1)" title="Move later">▶</button>` : ''}
        <button type="button" class="slide-del" onclick="app.removeMultiSlide(${i})" title="Remove photo">✕</button>
      </div>
    `).join('');
  }

  openThumbnailModal() {
    if (!this.videoStudio) return;
    const modal = document.getElementById('thumbnailStudioModal');
    if (!modal) return;
    modal.classList.add('open');

    const titleInput = document.getElementById('thumbTitleInput');
    if (titleInput && (!titleInput.value || !titleInput.value.trim())) {
      titleInput.value = this.activeStudioSong ? this.activeStudioSong.title : 'OFFICIAL RELEASE 2026';
    }

    this.updateThumbnailPreview();
  }

  async updateThumbnailPreview() {
    if (!this.videoStudio) return;
    const format = document.getElementById('thumbFormatSelect')?.value || '16:9';
    const title = document.getElementById('thumbTitleInput')?.value || '';
    const badge = document.getElementById('thumbBadgeSelect')?.value || '';

    const img = document.getElementById('thumbPreviewImg');
    const placeholder = document.getElementById('thumbPreviewPlaceholder');

    try {
      const dataUrl = await this.videoStudio.exportThumbnail(format, { title, badge });
      if (img && dataUrl) {
        img.src = dataUrl;
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
      }
    } catch (e) {
      console.warn('Failed to update thumbnail preview:', e);
    }
  }

  async downloadViralThumbnail() {
    if (!this.videoStudio) return;
    const format = document.getElementById('thumbFormatSelect')?.value || '16:9';
    const title = document.getElementById('thumbTitleInput')?.value || 'Thumbnail';
    const badge = document.getElementById('thumbBadgeSelect')?.value || '';

    this.showToast('Rendering high-impact viral thumbnail...', 'cyan');

    try {
      const dataUrl = await this.videoStudio.exportThumbnail(format, { title, badge });
      const a = document.createElement('a');
      a.href = dataUrl;
      const cleanTitle = (title || 'thumbnail').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${cleanTitle}_${format.replace(':', 'x')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      this.showToast('Thumbnail downloaded successfully!', 'emerald');
    } catch (err) {
      this.showToast(`Thumbnail export error: ${err.message}`, 'rose');
    }
  }

  updateVideoBranding() {
    if (!this.videoStudio) return;
    const name = document.getElementById('videoStudioName')?.value || 'NTK Hub';
    const sub = document.getElementById('videoStudioSubtitle')?.value || 'Official Visualizer';
    const wm = document.getElementById('videoWatermarkPos')?.value || 'top-left';

    this.videoStudio.studioName = name;
    this.videoStudio.studioSubtitle = sub;
    this.videoStudio.watermarkPos = wm;

    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  toggleVideoFooter(checked) {
    if (!this.videoStudio) return;
    this.videoStudio.showFooter = Boolean(checked);
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  async handleCustomBgUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !this.videoStudio) return;

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      this.pendingUncroppedImage = {
        dataUrl,
        target: 'videoBg',
        fileName: file.name
      };

      const isVertical = this.videoStudio.aspectRatio === '9:16';
      const isLandscape = this.videoStudio.aspectRatio === '16:9';
      const defaultRatio = isVertical ? '9:16' : (isLandscape ? '16:9' : '1:1');

      await this.imageCropper.open({
        imageSource: dataUrl,
        targetType: isVertical ? 'backdrop_vertical' : 'backdrop_landscape',
        aspectRatio: defaultRatio,
        title: 'Crop Video Backdrop Image',
        onApply: async (cropped) => {
          await this.videoStudio.setCustomBackground(cropped.dataUrl);

          const bgStatus = document.getElementById('videoBgStatusText');
          const clearBtn = document.getElementById('btnClearVideoBg');
          if (bgStatus) bgStatus.textContent = `Custom Backdrop: ${file.name} (${cropped.width}×${cropped.height})`;
          if (clearBtn) clearBtn.style.display = 'inline-block';

          this.saveVideoStudioSettings();
          this.redrawStaticVideoPreview();
          this.showToast(`Applied cropped backdrop (${cropped.width}×${cropped.height}px)!`, 'emerald');
        },
        onCancel: () => {
          this.showToast('Backdrop crop cancelled.', 'slate');
        }
      });
    } catch (err) {
      this.showToast(`Error reading image: ${err.message}`, 'rose');
    } finally {
      event.target.value = '';
    }
  }

  async clearCustomVideoBg() {
    if (!this.videoStudio) return;
    await this.videoStudio.setCustomBackground(null);

    const bgStatus = document.getElementById('videoBgStatusText');
    const clearBtn = document.getElementById('btnClearVideoBg');
    if (bgStatus) bgStatus.textContent = 'Using Album Artwork Backdrop';
    if (clearBtn) clearBtn.style.display = 'none';

    this.saveVideoStudioSettings();
    this.redrawStaticVideoPreview();
    this.showToast('Reset background to album artwork.', 'cyan');
  }

  updateVideoBgSettings() {
    if (!this.videoStudio) return;
    const dimVal = Number(document.getElementById('videoBgDim')?.value || 40);
    const blurVal = Number(document.getElementById('videoBgBlur')?.value || 20);
    const motion = document.getElementById('videoBgMotion')?.value || 'ken-burns';
    const trans = document.getElementById('videoSlideTransition')?.value || 'crossfade';

    this.videoStudio.bgDimOpacity = dimVal / 100;
    this.videoStudio.bgBlurPx = blurVal;
    this.videoStudio.bgMotion = motion;
    this.videoStudio.slideTransition = trans;

    const dimLabel = document.getElementById('videoBgDimVal');
    const blurLabel = document.getElementById('videoBgBlurVal');
    if (dimLabel) dimLabel.textContent = `${dimVal}%`;
    if (blurLabel) blurLabel.textContent = `${blurVal}px`;

    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateSlideTransition(val) {
    if (!this.videoStudio) return;
    this.videoStudio.setSlideTransition(val);
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  setVideoArtMode(mode) {
    if (!this.videoStudio) return;
    this.videoStudio.artMode = mode;
    document.querySelectorAll('[data-artmode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.artmode === mode);
    });
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateVideoArtSettings() {
    if (!this.videoStudio) return;
    const scaleVal = Number(document.getElementById('videoArtScale')?.value || 44);
    const corners = document.getElementById('videoArtCorners')?.value || '28';
    const glowVal = Number(document.getElementById('videoArtGlow')?.value || 70);

    this.videoStudio.artSizeScale = scaleVal / 100;
    this.videoStudio.artCornerRadius = isNaN(Number(corners)) ? corners : Number(corners);
    this.videoStudio.artGlowIntensity = glowVal / 100;

    const scaleLabel = document.getElementById('videoArtScaleVal');
    const glowLabel = document.getElementById('videoArtGlowVal');
    if (scaleLabel) scaleLabel.textContent = `${scaleVal}%`;
    if (glowLabel) glowLabel.textContent = `${glowVal}%`;

    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  async handleCustomArtUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !this.videoStudio) return;

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      this.pendingUncroppedImage = {
        dataUrl,
        target: 'videoArt',
        fileName: file.name
      };

      await this.imageCropper.open({
        imageSource: dataUrl,
        targetType: 'cover',
        aspectRatio: '1:1',
        title: 'Crop Album Art / Vinyl Center Label',
        onApply: async (cropped) => {
          await this.videoStudio.setCustomCover(cropped.dataUrl);

          const statusEl = document.getElementById('videoArtStatusText');
          const clearBtn = document.getElementById('btnClearVideoArt');
          if (statusEl) statusEl.textContent = `Custom Artwork: ${file.name} (${cropped.width}×${cropped.height})`;
          if (clearBtn) clearBtn.style.display = 'inline-block';

          this.saveVideoStudioSettings();
          this.redrawStaticVideoPreview();
          this.showToast(`Applied cropped artwork (${cropped.width}×${cropped.height}px)!`, 'emerald');
        },
        onCancel: () => {
          this.showToast('Artwork crop cancelled.', 'slate');
        }
      });
    } catch (err) {
      this.showToast(`Error reading image: ${err.message}`, 'rose');
    } finally {
      event.target.value = '';
    }
  }

  async clearCustomArt() {
    if (!this.videoStudio) return;
    await this.videoStudio.setCustomCover(null);

    const statusEl = document.getElementById('videoArtStatusText');
    const clearBtn = document.getElementById('btnClearVideoArt');
    if (statusEl) statusEl.textContent = 'Using Song Artwork';
    if (clearBtn) clearBtn.style.display = 'none';

    this.saveVideoStudioSettings();
    this.redrawStaticVideoPreview();
    this.showToast('Reset to default song artwork.', 'cyan');
  }

  setVideoAspectRatio(ratio) {
    if (!this.videoStudio) return;
    this.videoStudio.aspectRatio = ratio;
    const container = document.getElementById('canvasContainer');
    if (container) {
      const isFs = container.classList.contains('cinema-fullscreen');
      container.className = `canvas-container ratio-${ratio.replace(':', '-')}${isFs ? ' cinema-fullscreen' : ''}`;
    }
    // Update all ratio buttons across Studio tabs, preview toolbar, and fullscreen cinema HUD
    document.querySelectorAll('.ratio-btn, .preview-ratio-chip, .cinema-hud-btn').forEach((b) => {
      const bRatio = b.dataset.ratio || (b.textContent.includes('1:1') ? '1:1' : (b.textContent.includes('9:16') ? '9:16' : (b.textContent.includes('16:9') ? '16:9' : '')));
      b.classList.toggle('active', bRatio === ratio);
    });
    // Update cinema hud badge
    const cinemaRatioBadge = document.getElementById('cinemaHudRatio');
    if (cinemaRatioBadge) {
      const labels = { '1:1': '1:1 Square', '9:16': '9:16 Vertical Story', '16:9': '16:9 Cinema Wide' };
      cinemaRatioBadge.textContent = labels[ratio] || ratio;
    }
    this.videoStudio.updateCanvasDimensions();
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
    const ratioName = ratio === '9:16' ? '9:16 Vertical Story (TikTok / Reels / Shorts)' : (ratio === '16:9' ? '16:9 Cinema Wide (YouTube HD)' : '1:1 Square (Instagram Post)');
    this.showToast(`Format set to ${ratioName}`, 'cyan');
  }

  togglePreviewExpand() {
    const modalContent = document.querySelector('.studio-modal-content');
    const btn = document.getElementById('btnTogglePreviewExpand');
    if (!modalContent) return;

    const isExpanded = modalContent.classList.toggle('preview-expanded');
    if (btn) {
      btn.classList.toggle('active', isExpanded);
      const icon = btn.querySelector('.expand-icon');
      const text = btn.querySelector('.expand-text');
      if (icon) icon.textContent = isExpanded ? '⤡' : '⤢';
      if (text) text.textContent = isExpanded ? 'Compact View' : 'Expand Preview';
    }

    if (this.videoStudio && !this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
    this.showToast(isExpanded ? '⤢ Expanded to Theater Mode' : '⤡ Restored Compact View', 'cyan');
  }

  enterPreviewFullscreen() {
    const container = document.getElementById('canvasContainer');
    if (!container) return;
    container.classList.add('cinema-fullscreen');

    // Update cinema HUD labels
    const titleEl = document.getElementById('cinemaHudSongTitle');
    if (titleEl && this.activeStudioSong) {
      titleEl.textContent = `${this.activeStudioSong.title || 'Untitled'} - ${this.activeStudioSong.artist || 'Suno'}`;
    }
    const ratioBadge = document.getElementById('cinemaHudRatio');
    if (ratioBadge && this.videoStudio) {
      const curRatio = this.videoStudio.aspectRatio || '1:1';
      const labels = { '1:1': '1:1 Square', '9:16': '9:16 Vertical Story', '16:9': '16:9 Cinema Wide' };
      ratioBadge.textContent = labels[curRatio] || curRatio;
    }
    // Sync cinema play/pause button state
    const cinemaPlayBtn = document.getElementById('btnCinemaPlayPause');
    const livePlayBtn = document.getElementById('btnVideoLivePreview');
    if (cinemaPlayBtn && livePlayBtn) {
      cinemaPlayBtn.textContent = livePlayBtn.textContent;
    }
    // Sync cinema scrubber
    const scrubber = document.getElementById('videoTimelineScrubber');
    const cinemaScrubber = document.getElementById('cinemaTimelineScrubber');
    const timeText = document.getElementById('videoTimelineTime');
    const cinemaTime = document.getElementById('cinemaTimelineTime');
    if (scrubber && cinemaScrubber) cinemaScrubber.value = scrubber.value;
    if (timeText && cinemaTime) cinemaTime.textContent = timeText.textContent;

    // Attempt native browser fullscreen if supported
    if (container.requestFullscreen && !document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    }

    this.showToast('⛶ Fullscreen Cinema View (Press Esc or double-click to exit)', 'cyan');
  }

  exitPreviewFullscreen() {
    const container = document.getElementById('canvasContainer');
    if (container) {
      container.classList.remove('cinema-fullscreen');
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    if (this.videoStudio && !this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  togglePreviewFullscreen() {
    const container = document.getElementById('canvasContainer');
    if (!container) return;
    if (container.classList.contains('cinema-fullscreen') || document.fullscreenElement) {
      this.exitPreviewFullscreen();
    } else {
      this.enterPreviewFullscreen();
    }
  }

  setVideoResolution(res) {
    if (!this.videoStudio) return;
    this.videoStudio.setResolution(res);

    document.querySelectorAll('.res-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.res === res);
    });

    const resBadge = document.getElementById('videoCanvasBadge');
    if (resBadge) {
      resBadge.textContent = res === '1080p' ? '1080p Full HD' : (res === '720p' ? '720p HD' : '480p Fast SD');
    }

    const renderBtnLabel = document.getElementById('renderBtnLabel');
    if (renderBtnLabel) {
      renderBtnLabel.textContent = `🎬 Render & Export ${res.toUpperCase()} Video`;
    }

    const bitSelect = document.getElementById('videoBitrateSelect');
    if (bitSelect && this.videoStudio.bitrateMbps) {
      bitSelect.value = String(this.videoStudio.bitrateMbps);
    }

    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
    this.showToast(`Switched export resolution to ${res.toUpperCase()}`, 'cyan');
  }

  setVideoStyle(style) {
    if (!this.videoStudio) return;
    this.videoStudio.visualStyle = style;
    if (style === 'none') {
      this.videoStudio.showVisualizer = false;
      const chk = document.getElementById('chkVideoVisualizer');
      if (chk) chk.checked = false;
    } else {
      this.videoStudio.showVisualizer = true;
      const chk = document.getElementById('chkVideoVisualizer');
      if (chk) chk.checked = true;
    }
    document.querySelectorAll('[data-vstyle]').forEach((b) => {
      b.classList.toggle('active', b.dataset.vstyle === style);
    });
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  toggleVideoVisualizer(checked) {
    if (!this.videoStudio) return;
    this.videoStudio.showVisualizer = Boolean(checked);
    const chk = document.getElementById('chkVideoVisualizer');
    if (chk && chk.checked !== Boolean(checked)) chk.checked = Boolean(checked);
    if (!this.videoStudio.showVisualizer) {
      document.querySelectorAll('[data-vstyle]').forEach((b) => {
        b.classList.toggle('active', b.dataset.vstyle === 'none');
      });
    } else if (this.videoStudio.visualStyle === 'none') {
      this.videoStudio.visualStyle = 'bars';
      document.querySelectorAll('[data-vstyle]').forEach((b) => {
        b.classList.toggle('active', b.dataset.vstyle === 'bars');
      });
    }
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateVideoVizPosition(pos) {
    if (!this.videoStudio) return;
    if (pos === 'custom') {
      return;
    }
    if (this.videoStudio.customPositions) {
      this.videoStudio.customPositions.visualizer = null;
    }
    this.videoStudio.vizPosition = pos;
    if (pos === 'around_artwork' && this.videoStudio.visualStyle !== 'circular') {
      this.setVideoStyle('circular');
    }
    this.saveVideoStudioSettings();
    const resetBtn = document.getElementById('btnResetCanvasPositions');
    if (resetBtn) {
      const hasAny = this.videoStudio.customPositions && Object.values(this.videoStudio.customPositions).some((p) => p !== null);
      resetBtn.style.display = hasAny ? 'inline-flex' : 'none';
    }
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateVideoVizDimensions() {
    if (!this.videoStudio) return;
    const wVal = Number(document.getElementById('videoVizWidth')?.value || 74);
    const hVal = Number(document.getElementById('videoVizHeight')?.value || 120);

    this.videoStudio.vizWidthPercent = wVal / 100;
    this.videoStudio.vizMaxHeight = hVal;

    const wLabel = document.getElementById('videoVizWidthVal');
    const hLabel = document.getElementById('videoVizHeightVal');
    if (wLabel) wLabel.textContent = `${wVal}%`;
    if (hLabel) hLabel.textContent = `${hVal}px`;

    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  setVideoTheme(theme) {
    if (!this.videoStudio) return;
    this.videoStudio.theme = theme;
    this.videoStudio.customColors = null;
    document.querySelectorAll('.theme-swatch-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.vtheme === theme);
    });
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateCustomVideoColors() {
    if (!this.videoStudio) return;
    const primary = document.getElementById('videoCustomPrimary')?.value || '#fbbf24';
    const secondary = document.getElementById('videoCustomSecondary')?.value || '#f43f5e';
    this.videoStudio.customColors = { primary, secondary, glow: '245, 158, 11' };
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  resetCustomVideoColors() {
    if (!this.videoStudio) return;
    this.videoStudio.customColors = null;
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
    this.showToast('Reset to theme colors.', 'cyan');
  }

  toggleVideoParticles(checked) {
    if (!this.videoStudio) return;
    this.videoStudio.showParticles = Boolean(checked);
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  toggleVideoLyrics(checked) {
    if (!this.videoStudio) return;
    this.videoStudio.showLyrics = Boolean(checked);
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateVideoFont(font) {
    if (!this.videoStudio) return;
    this.videoStudio.fontFamily = font;
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  updateVideoLyricPos(pos) {
    if (!this.videoStudio) return;
    this.videoStudio.lyricPosition = pos;
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  setVideoLyricAnimation(style) {
    if (!this.videoStudio) return;
    this.videoStudio.lyricAnimation = style;
    const select = document.getElementById('videoLyricAnimSelect');
    if (select && select.value !== style) select.value = style;
    this.saveVideoStudioSettings();
    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  async fetchOnlineLyricsForVideo() {
    if (!this.activeStudioSong || !this.videoStudio) return;
    const target = { song: this.activeStudioSong, studio: this.videoStudio, text: document.getElementById('videoLyricsTextarea')?.value, revision: this._lyricsRevision };
    const btn = document.getElementById('btnFetchOnlineLyrics');
    const statusText = document.getElementById('videoLyricsStatusText');
    const oldText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Searching LRCLIB...';
    }
    if (statusText) statusText.textContent = 'Querying LRCLIB database...';

    try {
      const result = await LyricsUtils.searchOnlineLyrics(
        this.activeStudioSong.title,
        this.activeStudioSong.artist || '',
        this.activeStudioSong.duration || 180
      );
      if (this.activeStudioSong !== target.song || this.videoStudio !== target.studio || this._lyricsRevision !== target.revision || document.getElementById('videoLyricsTextarea')?.value !== target.text || !document.getElementById('videoStudioModal')?.classList.contains('open')) return;

      const lyricsToUse = result.syncedLyrics || result.plainLyrics;
      if (!lyricsToUse) {
        this.showToast('No online lyrics found for this track.', 'amber');
        if (statusText) statusText.textContent = 'No online lyrics found.';
        return;
      }

      const textarea = document.getElementById('videoLyricsTextarea');
      if (textarea) textarea.value = lyricsToUse;
      this.updateVideoLyricsText();

      const dur = this.activeStudioSong.duration || 180;
      this.videoStudio.setCustomLyrics(lyricsToUse, dur);

      const cuesBadge = document.getElementById('videoLyricCuesCount');
      if (cuesBadge) cuesBadge.textContent = `${this.videoStudio.lyricCues.length} cues`;

      if (statusText) {
        statusText.textContent = result.isSynced
          ? `Loaded synced lyrics (${this.videoStudio.lyricCues.length} cues)`
          : `Loaded plain lyrics (${this.videoStudio.lyricCues.length} cues)`;
      }

      this.redrawStaticVideoPreview();
      this.showToast(`Loaded ${this.videoStudio.lyricCues.length} ${result.isSynced ? 'synced' : 'timed'} lyric cues!`, 'emerald');
    } catch (err) {
      if (statusText) statusText.textContent = `Search failed: ${err.message}`;
      this.showToast(err.message || 'Lyrics search failed', 'rose');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || 'Search Online (LRCLIB)';
      }
    }
  }

  handleLyricsFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !this.videoStudio) return;
    if (file.size > 200000) { this.showToast('Lyrics files must be smaller than 200 KB.', 'amber'); return; }
    const target = { song: this.activeStudioSong, studio: this.videoStudio, text: document.getElementById('videoLyricsTextarea')?.value, revision: this._lyricsRevision };

    const reader = new FileReader();
    reader.onload = (e) => {
      if (this.activeStudioSong !== target.song || this.videoStudio !== target.studio || this._lyricsRevision !== target.revision || document.getElementById('videoLyricsTextarea')?.value !== target.text || !document.getElementById('videoStudioModal')?.classList.contains('open')) return;
      const text = e.target.result;
      const textarea = document.getElementById('videoLyricsTextarea');
      if (textarea) textarea.value = text;
      this.updateVideoLyricsText();

      const cuesBadge = document.getElementById('videoLyricCuesCount');
      if (cuesBadge) cuesBadge.textContent = `${this.videoStudio.lyricCues.length} cues`;

      const statusText = document.getElementById('videoLyricsStatusText');
      if (statusText) statusText.textContent = `Imported from ${file.name}`;

      this.redrawStaticVideoPreview();
      this.showToast(`Imported ${this.videoStudio.lyricCues.length} cues from ${file.name}!`, 'emerald');
    };
    reader.onerror = () => this.showToast('Could not read this lyrics file.', 'rose');
    reader.readAsText(file);
  }

  async resetLyricsFromSong() {
    if (!this.videoStudio || !this.activeStudioSong) return;
    const target = { song: this.activeStudioSong, studio: this.videoStudio, text: document.getElementById('videoLyricsTextarea')?.value, revision: this._lyricsRevision };
    let raw = (this.activeStudioSong.prompt || '').trim();
    const textarea = document.getElementById('videoLyricsTextarea');
    const cuesBadge = document.getElementById('videoLyricCuesCount');
    const statusText = document.getElementById('videoLyricsStatusText');

    if (!raw && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(this.activeStudioSong.uuid)) {
      if (statusText) statusText.textContent = 'Fetching prompt lyrics from Suno...';
      try {
        const freshMeta = await SunoAPI.fetchMetadata(this.activeStudioSong.uuid);
        if (this.activeStudioSong !== target.song || this.videoStudio !== target.studio || this._lyricsRevision !== target.revision || textarea?.value !== target.text || !document.getElementById('videoStudioModal')?.classList.contains('open')) return;
        if (freshMeta && freshMeta.prompt) {
          raw = freshMeta.prompt.trim();
          this.activeStudioSong.prompt = raw;
          if (freshMeta.title && !freshMeta.title.startsWith('Suno_Song_')) {
            this.activeStudioSong.title = freshMeta.title;
          }
          const songs = StorageManager.loadSongs();
          const idx = songs.findIndex((s) => s.uuid === this.activeStudioSong.uuid);
          if (idx !== -1) {
            songs[idx] = { ...songs[idx], ...this.activeStudioSong };
            StorageManager.saveSongs(songs);
          }
        }
      } catch (e) {}
    }

    if (textarea) textarea.value = raw;
    this.updateVideoLyricsText();

    const dur = this.activeStudioSong.duration || 180;
    this.videoStudio.setCustomLyrics(raw, dur);

    if (cuesBadge) cuesBadge.textContent = `${this.videoStudio.lyricCues.length} cues`;
    if (statusText) {
      statusText.textContent = this.videoStudio.lyricCues.length > 0
        ? `Reset to Suno prompt (${this.videoStudio.lyricCues.length} cues)`
        : 'Suno prompt has no lyrics text';
    }

    this.redrawStaticVideoPreview();
    this.showToast(raw ? 'Reset lyrics to Suno prompt.' : 'No lyrics prompt found on Suno.', raw ? 'cyan' : 'amber');
  }

  updateVideoLyricsText() {
    this._lyricsRevision = (this._lyricsRevision || 0) + 1;
    this.updateLyricsSyncSummary();
    if (!this.videoStudio || !this.activeStudioSong) return;
    if (this.tapSyncState?.active) this.cancelTapToSync(false);
    const textarea = document.getElementById('videoLyricsTextarea');
    const text = textarea ? textarea.value : '';

    const dur = (this.activeStudioSong && this.activeStudioSong.duration) || 180;
    this.videoStudio.setCustomLyrics(text, dur, null);
    this.activeStudioSong.customLyrics = text;
    this.activeStudioSong.lyricTiming = null;
    StorageManager.upsertSong(this.activeStudioSong);

    const cuesBadge = document.getElementById('videoLyricCuesCount');
    if (cuesBadge) cuesBadge.textContent = `${this.videoStudio.lyricCues.length} cues`;

    const statusText = document.getElementById('videoLyricsStatusText');
    if (statusText) statusText.textContent = `Edited (${this.videoStudio.lyricCues.length} cues)`;

    if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
      this.redrawStaticVideoPreview();
    }
  }

  toggleTapToSync() {
    if (!this.videoStudio || !this.activeStudioSong) return;
    const panel = document.getElementById('tapSyncPanel');
    if (!panel) return;

    if (this.tapSyncState && this.tapSyncState.active) {
      this.cancelTapToSync();
      return;
    }

    const textarea = document.getElementById('videoLyricsTextarea');
    const rawText = textarea ? textarea.value : '';
    // Split into clean lines, removing existing timestamps if re-syncing
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.replace(/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*/, '').trim())
      .filter((l) => l.length > 0 && !/^\[.*?\]$/.test(l));

    if (lines.length === 0) {
      this.showToast('Please paste or reset lyrics before starting Tap-to-Sync.', 'amber');
      return;
    }

    this.tapSyncState = {
      active: true,
      lines: lines,
      stamped: [],
      currentIndex: 0
    };

    panel.style.display = 'block';
    const hud = document.getElementById('previewTapSyncHud');
    if (hud) hud.style.display = 'flex';
    this.updateTapSyncUI();

    // Start audio preview if paused
    if (!this.videoStudio.isPreviewing) {
      this.toggleVideoPreview();
    }

    // Attach global keyboard listener for Spacebar
    if (!this._tapSyncKeyHandler) {
      this._tapSyncKeyHandler = (e) => {
        if (!this.tapSyncState || !this.tapSyncState.active) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          this.tapNextLyricLine();
        }
      };
      window.addEventListener('keydown', this._tapSyncKeyHandler);
    }

    this.showToast('Tap-to-Sync active: Listen to audio and press Spacebar at each line!', 'emerald');
  }

  updateTapSyncUI() {
    if (!this.tapSyncState) return;
    const idx = this.tapSyncState.currentIndex;
    const total = this.tapSyncState.lines.length;
    const progressEl = document.getElementById('tapSyncProgress');
    const currLineEl = document.getElementById('tapSyncCurrentLine');
    const nextLineEl = document.getElementById('tapSyncNextLine');
    const btnAction = document.getElementById('btnTapSyncAction');

    // HUD Elements directly in preview pane
    const hudProgressEl = document.getElementById('hudTapSyncProgress');
    const hudCurrLineEl = document.getElementById('hudTapSyncCurrentLine');
    const hudNextLineEl = document.getElementById('hudTapSyncNextLine');
    const btnHudAction = document.getElementById('btnHudTapSyncAction');

    const progressStr = `Line ${Math.min(idx + 1, total)} of ${total}`;
    const currStr = idx < total ? this.tapSyncState.lines[idx] : '🎉 All lines stamped!';
    const nextStr = idx + 1 < total ? `Next: ${this.tapSyncState.lines[idx + 1]}` : (idx < total ? 'Next: (End of song)' : '');
    const actionStr = idx < total ? `👉 Tap Line ${idx + 1} (Spacebar)` : '✅ Finish & Save Cues';

    if (progressEl) progressEl.textContent = progressStr;
    if (currLineEl) currLineEl.textContent = currStr;
    if (nextLineEl) nextLineEl.textContent = nextStr;
    if (btnAction) btnAction.textContent = actionStr;

    if (hudProgressEl) hudProgressEl.textContent = progressStr;
    if (hudCurrLineEl) hudCurrLineEl.textContent = currStr;
    if (hudNextLineEl) hudNextLineEl.textContent = nextStr;
    if (btnHudAction) btnHudAction.textContent = actionStr;
  }

  tapNextLyricLine() {
    if (!this.tapSyncState || !this.tapSyncState.active) return;
    const idx = this.tapSyncState.currentIndex;
    const total = this.tapSyncState.lines.length;

    if (idx >= total) {
      this.finishTapToSync();
      return;
    }

    const currentSec = (this.videoStudio && this.videoStudio.getCurrentPreviewTime()) || this.getCurrentVideoTime() || 0;
    const mins = Math.floor(currentSec / 60);
    const secs = Math.floor(currentSec % 60);
    const hundredths = Math.floor((currentSec - Math.floor(currentSec)) * 100);
    const timestampTag = `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;

    const stampedLine = `${timestampTag} ${this.tapSyncState.lines[idx]}`;
    this.tapSyncState.stamped.push(stampedLine);
    this.tapSyncState.currentIndex++;

    if (this.tapSyncState.currentIndex >= total) {
      this.finishTapToSync();
    } else {
      this.updateTapSyncUI();
    }
  }

  async finishTapToSync(partial = false) {
    if (!this.tapSyncState) return;
    const total = this.tapSyncState.lines.length;
    const stampedCount = this.tapSyncState.stamped.length;

    let finalText = [...this.tapSyncState.stamped];
    if (stampedCount < total) {
      for (let i = stampedCount; i < total; i++) {
        finalText.push(this.tapSyncState.lines[i]);
      }
    }

    const outputString = finalText.join('\n');
    const textarea = document.getElementById('videoLyricsTextarea');
    if (textarea) textarea.value = outputString;
    this.updateVideoLyricsText();

    const dur = (this.activeStudioSong && this.activeStudioSong.duration) || 180;
    this.videoStudio.setCustomLyrics(outputString, dur);

    if (this.activeStudioSong) {
      this.activeStudioSong.customLyrics = outputString;
      const songs = StorageManager.loadSongs();
      const idx = songs.findIndex((s) => s.uuid === this.activeStudioSong.uuid);
      if (idx !== -1) {
        songs[idx].customLyrics = outputString;
        StorageManager.saveSongs(songs);
      }
    }

    const cuesBadge = document.getElementById('videoLyricCuesCount');
    if (cuesBadge) cuesBadge.textContent = `${this.videoStudio.lyricCues.length} cues`;

    const statusText = document.getElementById('videoLyricsStatusText');
    if (statusText) statusText.textContent = `Synced with exact timestamps (${stampedCount} stamped lines)`;

    this.cancelTapToSync(false);
    this.showToast(`Saved ${stampedCount} exact lyric timestamps! Launching preview...`, 'emerald');

    // Automatically stop tap sync preview and restart live preview from 0:00 so user can immediately preview what they synced!
    await this.restartVideoPreview();
  }

  cancelTapToSync(showToastMsg = true) {
    if (this.tapSyncState) {
      this.tapSyncState.active = false;
      this.tapSyncState = null;
    }
    const panel = document.getElementById('tapSyncPanel');
    if (panel) panel.style.display = 'none';

    const hud = document.getElementById('previewTapSyncHud');
    if (hud) hud.style.display = 'none';

    if (this._tapSyncKeyHandler) {
      window.removeEventListener('keydown', this._tapSyncKeyHandler);
      this._tapSyncKeyHandler = null;
    }

    if (showToastMsg) {
      this.showToast('Exited Tap-to-Sync mode.', 'slate');
    }
  }

  setVideoFps(fps) {
    if (!this.videoStudio) return;
    this.videoStudio.fps = Number(fps);
    this.saveVideoStudioSettings();
  }

  setVideoBitrate(mbps) {
    if (!this.videoStudio) return;
    this.videoStudio.bitrateMbps = Number(mbps);
    this.saveVideoStudioSettings();
  }

  async toggleVideoPreview() {
    if (!this.videoStudio || !this.activeStudioSong) return;
    const btn = document.getElementById('btnVideoLivePreview');
    const cinemaBtn = document.getElementById('btnCinemaPlayPause');

    if (this.videoStudio.isPreviewing) {
      this.videoStudio.stop();
      if (btn) btn.textContent = '▶ Live Preview with Audio';
      if (cinemaBtn) cinemaBtn.textContent = '▶ Live Preview with Audio';
      this.redrawStaticVideoPreview();
      return;
    }

    const startOffset = this.getCurrentVideoTime();
    await this.startVideoPreviewAtTime(startOffset);
  }

  async restartVideoPreview() {
    if (!this.videoStudio || !this.activeStudioSong) return;
    this.videoStudio.stop();
    const scrubber = document.getElementById('videoTimelineScrubber');
    const cinemaScrubber = document.getElementById('cinemaTimelineScrubber');
    if (scrubber) scrubber.value = 0;
    if (cinemaScrubber) cinemaScrubber.value = 0;
    const dur = (this.activeStudioSong && this.activeStudioSong.duration) || 180;
    const timeFormatted = `0:00 / ${this.formatTime(dur)}`;
    const timeText = document.getElementById('videoTimelineTime');
    const cinemaTime = document.getElementById('cinemaTimelineTime');
    if (timeText) timeText.textContent = timeFormatted;
    if (cinemaTime) cinemaTime.textContent = timeFormatted;
    await this.startVideoPreviewAtTime(0);
  }

  async getStudioAudioBuffer(uuid, onStatus = null) {
    const audioSource = this.videoStudio ? this.videoStudio.audioSourceType : 'master';
    if (audioSource === 'instrumental' || audioSource === 'vocals') {
      try {
        if (onStatus) onStatus(`Checking stems cache for ${audioSource}...`);
        const cachedStems = await VaultDB.getStems(uuid);
        if (cachedStems && cachedStems[audioSource + 'Wav']) {
          const audioBuffer = await AudioConverter.decodeAudioData(cachedStems[audioSource + 'Wav']);
          return { audioBuffer, audioSource };
        } else {
          this.showToast(`No cached ${audioSource} stem found; playing master mix. (Tip: Split stems in Stem tab first!)`, 'amber');
        }
      } catch (err) {
        console.warn('Failed loading cached stem audio:', err);
      }
    }
    return this.getDecryptedAudio(uuid, onStatus);
  }

  setVideoAudioSource(type) {
    if (!this.videoStudio) return;
    this.videoStudio.setAudioSourceType(type);
    this.saveVideoStudioSettings();
    const sel = document.getElementById('videoAudioSourceSelect');
    if (sel) sel.value = type;
    const labels = { master: 'Full Master Mix', instrumental: 'Karaoke Instrumental', vocals: 'Acapella Vocals' };
    this.showToast(`Audio track set to: ${labels[type] || type}`, 'cyan');
    if (this.videoStudio.isPreviewing) {
      this.restartVideoPreview();
    }
  }

  async handleWatermarkLogoUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || !this.videoStudio) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const size = Number(document.getElementById('videoWatermarkLogoSize')?.value) || 80;
      const opacity = (Number(document.getElementById('videoWatermarkLogoOpacity')?.value) || 90) / 100;
      await this.videoStudio.setWatermarkLogo(dataUrl, size, opacity);
      if (!this.videoStudio.watermarkLogoImg) { this.showToast('This image could not be loaded. Choose a valid PNG or SVG.', 'amber'); return; }
      const previewBox = document.getElementById('watermarkLogoPreviewBox');
      const previewImg = document.getElementById('watermarkLogoPreviewImg');
      const controls = document.getElementById('watermarkLogoControls');
      const btnClear = document.getElementById('btnClearWatermarkLogo');
      if (previewImg) previewImg.src = dataUrl;
      if (previewBox) previewBox.style.display = 'flex';
      if (controls) controls.style.display = 'flex';
      if (btnClear) btnClear.style.display = 'inline-block';
      this.redrawStaticVideoPreview();
      this.saveVideoStudioSettings();
      this.showToast('Watermark logo uploaded!', 'emerald');
    };
    reader.readAsDataURL(file);
  }

  clearWatermarkLogo() {
    if (!this.videoStudio) return;
    this.videoStudio.loadWatermarkLogo(null);
    const previewBox = document.getElementById('watermarkLogoPreviewBox');
    const controls = document.getElementById('watermarkLogoControls');
    const btnClear = document.getElementById('btnClearWatermarkLogo');
    const input = document.getElementById('videoWatermarkLogoFile');
    if (previewBox) previewBox.style.display = 'none';
    if (controls) controls.style.display = 'none';
    if (btnClear) btnClear.style.display = 'none';
    if (input) input.value = '';
    this.redrawStaticVideoPreview();
    this.saveVideoStudioSettings();
    this.showToast('Removed custom logo watermark.', 'amber');
  }

  updateWatermarkLogoSettings() {
    if (!this.videoStudio) return;
    const size = Number(document.getElementById('videoWatermarkLogoSize')?.value) || 80;
    const opacityPct = Number(document.getElementById('videoWatermarkLogoOpacity')?.value) || 90;
    const sizeVal = document.getElementById('videoWatermarkLogoSizeVal');
    const opacityVal = document.getElementById('videoWatermarkLogoOpacityVal');
    if (sizeVal) sizeVal.textContent = `${size}px`;
    if (opacityVal) opacityVal.textContent = `${opacityPct}%`;
    this.videoStudio.setWatermarkLogo(this.videoStudio.watermarkLogoDataUrl, size, opacityPct / 100);
    this.saveVideoStudioSettings();
    this.redrawStaticVideoPreview();
  }

  setVideoVizSensitivity(val) {
    if (!this.videoStudio) return;
    const gain = Number(val) || 1.0;
    const valEl = document.getElementById('videoVizSensitivityVal');
    if (valEl) valEl.textContent = `${gain.toFixed(1)}x`;
    this.videoStudio.setVizSensitivity(gain);
    this.saveVideoStudioSettings();
    this.redrawStaticVideoPreview();
  }

  updateLyricTypographySettings() {
    if (!this.videoStudio) return;
    const font = document.getElementById('videoFontFamily')?.value || 'Inter';
    const strokeWidth = Number(document.getElementById('videoLyricStrokeWidth')?.value ?? 4);
    const strokeColor = document.getElementById('videoLyricStrokeColor')?.value || '#000000';
    const scrimEnabled = document.getElementById('chkVideoLyricScrim')?.checked ?? true;
    const scrimOpacityPct = Number(document.getElementById('videoLyricScrimOpacity')?.value ?? 55);

    const strokeVal = document.getElementById('videoLyricStrokeWidthVal');
    const scrimVal = document.getElementById('videoLyricScrimOpacityVal');
    if (strokeVal) strokeVal.textContent = `${strokeWidth}px`;
    if (scrimVal) scrimVal.textContent = `${scrimOpacityPct}%`;

    this.videoStudio.setLyricTypography({
      fontFamily: font,
      strokeWidth,
      strokeColor,
      scrimEnabled,
      scrimOpacity: scrimOpacityPct / 100
    });
    this.saveVideoStudioSettings();
    this.redrawStaticVideoPreview();
  }

  exportStudioLyrics(format = 'lrc') {
    if (!this.activeStudioSong) {
      this.showToast('No active song selected in Video Studio.', 'amber');
      return;
    }
    const dur = (this.videoStudio && this.videoStudio.audioBuffer?.duration) || this.activeStudioSong.duration || 180;
    const editor = document.getElementById('videoLyricsTextarea');
    const exportSong = { ...this.activeStudioSong, customLyrics: editor ? editor.value : (this.videoStudio?.customLyricsText ?? this.activeStudioSong.customLyrics ?? ''), lyricTiming: this.videoStudio?.lyricTiming };
    const cleanTitle = (this.activeStudioSong.title || 'Lyrics').replace(/[\\/:*?"<>|]+/g, '_');
    let content = '';
    let mimeType = 'text/plain;charset=utf-8';
    let ext = format.toLowerCase();

    if (ext === 'srt') {
      content = LyricsUtils.toSrt(exportSong, dur);
      mimeType = 'application/x-subrip;charset=utf-8';
    } else {
      ext = 'lrc';
      content = LyricsUtils.toLrc(exportSong, dur);
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast(`Exported ${ext.toUpperCase()} subtitle sidecar!`, 'emerald');
  }

  async startVideoPreviewAtTime(startOffset = 0) {
    if (!this.videoStudio || !this.activeStudioSong) return;
    if (this._videoRenderOperation) return;
    const request = { studio: this.videoStudio, song: this.activeStudioSong };
    this._previewRequest = request;
    const isCurrent = () => this._previewRequest === request && this.videoStudio === request.studio && this.activeStudioSong === request.song && document.getElementById('videoStudioModal')?.classList.contains('open');
    const btn = document.getElementById('btnVideoLivePreview');
    const cinemaBtn = document.getElementById('btnCinemaPlayPause');
    const scrubber = document.getElementById('videoTimelineScrubber');
    const cinemaScrubber = document.getElementById('cinemaTimelineScrubber');
    const timeText = document.getElementById('videoTimelineTime');
    const cinemaTime = document.getElementById('cinemaTimelineTime');

    this.isUserDraggingScrubber = false;

    if (btn) btn.textContent = '⏳ Loading Audio...';
    if (cinemaBtn) cinemaBtn.textContent = '⏳ Loading Audio...';

    try {
      const { audioBuffer } = await this.getStudioAudioBuffer(request.song.uuid);
      if (!isCurrent()) return;
      const totalDur = audioBuffer.duration || this.activeStudioSong.duration || 180;

      // Ensure custom lyrics are maintained
      const textarea = document.getElementById('videoLyricsTextarea');
      const lyricsToUse = textarea ? textarea.value.trim() : (this.activeStudioSong.customLyrics ?? this.activeStudioSong.prompt ?? '');
      this.videoStudio.setCustomLyrics(lyricsToUse, totalDur, this.videoStudio.lyricTiming || this.activeStudioSong.lyricTiming);

      this.videoStudio.onPreviewEnded = () => {
        if (btn) btn.textContent = '▶ Live Preview with Audio';
        if (cinemaBtn) cinemaBtn.textContent = '▶ Live Preview with Audio';
        if (scrubber) scrubber.value = 0;
        if (cinemaScrubber) cinemaScrubber.value = 0;
        const endFormatted = `0:00 / ${this.formatTime(totalDur)}`;
        if (timeText) timeText.textContent = endFormatted;
        if (cinemaTime) cinemaTime.textContent = endFormatted;
      };

      this.videoStudio.startPreview(audioBuffer, this.activeStudioSong, startOffset, (elapsed, dur) => {
        const safeDur = dur || totalDur || 180;
        const safeElapsed = Math.min(safeDur, Math.max(0, elapsed));
        const ratio = Math.min(1, Math.max(0, safeElapsed / safeDur));
        const scrubVal = Math.round(ratio * 1000);
        const timeFormatted = `${this.formatTime(safeElapsed)} / ${this.formatTime(safeDur)}`;

        if (scrubber && !this.isUserDraggingScrubber) {
          scrubber.value = scrubVal;
        }
        if (cinemaScrubber && !this.isUserDraggingScrubber) {
          cinemaScrubber.value = scrubVal;
        }
        if (timeText) {
          timeText.textContent = timeFormatted;
        }
        if (cinemaTime) {
          cinemaTime.textContent = timeFormatted;
        }
      });

      if (btn) btn.textContent = '⏹ Stop Live Preview';
      if (cinemaBtn) cinemaBtn.textContent = '⏹ Stop Preview';
    } catch (e) {
      if (!isCurrent()) return;
      if (btn) btn.textContent = '▶ Live Preview with Audio';
      if (cinemaBtn) cinemaBtn.textContent = '▶ Live Preview with Audio';
      this.showToast(`Preview failed: ${e.message}`, 'rose');
    }
  }

  async renderAndExportVideo() {
    if (!this.videoStudio || !this.activeStudioSong) return;
    if (this._videoRenderOperation) return;
    const operation = { studio: this.videoStudio, song: this.activeStudioSong };
    this._videoRenderOperation = operation;
    this._previewRequest = null;
    const uuid = operation.song.uuid;
    const isCurrent = () => this.videoStudio === operation.studio && this.activeStudioSong === operation.song && document.getElementById('videoStudioModal')?.classList.contains('open');
    const btn = document.getElementById('btnStartVideoRender');
    const previewBtn = document.getElementById('btnVideoLivePreview');
    const progressBox = document.getElementById('studioProgressBox');
    const progressBar = document.getElementById('studioProgressBar');
    const statusText = document.getElementById('studioStatusText');

    this.videoStudio.stop();
    if (previewBtn) previewBtn.textContent = '▶ Live Preview with Audio';
    if (btn) btn.disabled = true;
    if (progressBox) progressBox.style.display = 'flex';

    try {
      const { audioBuffer } = await this.getStudioAudioBuffer(uuid, (status) => {
        if (isCurrent() && statusText) statusText.textContent = status;
      });
      if (!isCurrent()) throw new Error('Rendering cancelled because the studio was closed or the song changed.');

      const totalDur = audioBuffer.duration || this.activeStudioSong.duration || 180;

      // Ensure latest lyrics (including tap-to-sync timestamps) are preserved in active song and studio
      const textarea = document.getElementById('videoLyricsTextarea');
      const lyricsToUse = textarea ? textarea.value.trim() : (this.activeStudioSong.customLyrics ?? this.activeStudioSong.prompt ?? '');
      this.activeStudioSong.customLyrics = lyricsToUse;
      this.videoStudio.setCustomLyrics(lyricsToUse, totalDur, this.videoStudio.lyricTiming || this.activeStudioSong.lyricTiming);

      const songs = StorageManager.loadSongs();
      const idx = songs.findIndex((s) => s.uuid === this.activeStudioSong.uuid);
      if (idx !== -1) {
        songs[idx].customLyrics = lyricsToUse;
        StorageManager.saveSongs(songs);
      }

      const videoBlob = await this.videoStudio.exportVideo(
        audioBuffer,
        this.activeStudioSong,
        this.activeStudioSong.imageLarge,
        (pct, text) => {
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (statusText) statusText.textContent = text;
        }
      );
      if (!isCurrent()) throw new Error('Rendering cancelled because the studio was closed or the song changed.');

      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = this.makeSafeFilename(this.activeStudioSong.title, ext);
      this.triggerDownload(videoBlob, filename);
      this.showToast(`Exported ${this.videoStudio.resolution || '1080p'} Karaoke Video: "${filename}"!`, 'emerald');
    } catch (e) {
      this.showToast(`Video rendering failed: ${e.message}`, 'rose');
    } finally {
      if (this._videoRenderOperation === operation) this._videoRenderOperation = null;
      if (btn) btn.disabled = false;
    }
  }

  /* =========================================================================
     OPENROUTER AI ZERO-EFFORT AUTO-TRANSCRIPTION & SYNC ENGINE
     ========================================================================= */

  toggleOpenRouterKeySection() {
    const sec = document.getElementById('openRouterConfigSection');
    const lbl = document.getElementById('openRouterKeyToggleLabel');
    if (!sec) return;
    const isHidden = sec.style.display === 'none' || !sec.style.display;
    sec.style.display = isHidden ? 'block' : 'none';
    if (lbl) lbl.textContent = isHidden ? 'Hide Config' : 'Configure Key';
  }

  toggleOpenRouterKeyVisibility() {
    const inp = document.getElementById('openRouterApiKeyInput');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  async saveOpenRouterKeyFromInput() {
    const inp = document.getElementById('openRouterApiKeyInput');
    const val = (inp && inp.value.trim()) || '';
    await VaultDB.saveOpenRouterKey(val);
    const modalInp = document.getElementById('modalOpenRouterApiKey');
    if (modalInp) modalInp.value = val;
    this.showToast('Saved OpenRouter key locally. Browser storage is not encrypted by this app.', 'emerald');
    const statusEl = document.getElementById('openRouterSyncStatus');
    if (statusEl) statusEl.textContent = val ? 'Ready • Key saved in vault' : 'Ready • Paste OpenRouter key';
  }

  async saveOpenRouterModelFromSelect() {
    const sel = document.getElementById('openRouterModelSelect');
    const val = (sel && sel.value) || 'openrouter/free';
    await VaultDB.saveOpenRouterModel(val);
    const modalSel = document.getElementById('modalOpenRouterModel');
    if (modalSel) modalSel.value = val;
  }

  async saveGroqKeyFromInput() {
    const inp = document.getElementById('groqApiKeyInput');
    const val = (inp && inp.value.trim()) || '';
    await VaultDB.saveGroqKey(val);
    const modalInp = document.getElementById('modalGroqApiKey');
    if (modalInp) modalInp.value = val;
    this.showToast('Saved free Groq API Key to vault!', 'emerald');
  }

  toggleGroqKeyVisibility() {
    const inp = document.getElementById('groqApiKeyInput');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  async saveGroqModelFromSelect() {
    const sel = document.getElementById('groqModelSelect');
    const val = (sel && sel.value) || 'whisper-large-v3-turbo';
    await VaultDB.saveGroqModel(val);
    const modalSel = document.getElementById('modalGroqModel');
    if (modalSel) modalSel.value = val;
  }

  async saveGeminiKeyFromInput() {
    const inp = document.getElementById('geminiApiKeyInput');
    const val = (inp && inp.value.trim()) || '';
    await VaultDB.saveGeminiKey(val);
    const modalInp = document.getElementById('modalGeminiApiKey');
    if (modalInp) modalInp.value = val;
    this.showToast('Saved Google AI Studio API Key to vault!', 'emerald');
  }

  toggleGeminiKeyVisibility() {
    const inp = document.getElementById('geminiApiKeyInput');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  async saveGeminiModelFromSelect() {
    const sel = document.getElementById('geminiModelSelect');
    const val = (sel && sel.value) || 'gemini-3.5-transcribe';
    await VaultDB.saveGeminiModel(val);
    const modalSel = document.getElementById('modalGeminiModel');
    if (modalSel) modalSel.value = val;
  }

  switchAiProvider(provider, persist = true) {
    const studioSel = document.getElementById('studioAiProvider');
    if (studioSel) studioSel.value = provider;
    const paneOR = document.getElementById('paneStudioOpenRouter');
    const paneGroq = document.getElementById('paneStudioGroq');
    const paneGemini = document.getElementById('paneStudioGemini');

    if (paneOR) paneOR.style.display = provider === 'openrouter' ? 'block' : 'none';
    if (paneGroq) paneGroq.style.display = provider === 'groq' ? 'block' : 'none';
    if (paneGemini) paneGemini.style.display = provider === 'gemini' ? 'block' : 'none';

    if (persist) VaultDB.saveAiProvider(provider);
    const modalSel = document.getElementById('modalAiProviderSelect');
    if (modalSel) modalSel.value = provider;
    this.switchAiProviderModal(provider);

    const statusEl = document.getElementById('openRouterSyncStatus');
    if (statusEl) {
      if (provider === 'groq') statusEl.textContent = 'Groq Whisper • Free account required; audio uploads only when you click Auto-Sync.';
      else if (provider === 'gemini') statusEl.textContent = 'Google • Free account required; audio uploads only when you click Auto-Sync.';
      else statusEl.textContent = 'OpenRouter Free supports text tools. Choose Groq or Google for audio alignment.';
    }
  }

  switchAiProviderModal(provider) {
    const paneOR = document.getElementById('modalPaneOpenRouter');
    const paneGroq = document.getElementById('modalPaneGroq');
    const paneGemini = document.getElementById('modalPaneGemini');

    if (paneOR) paneOR.style.display = provider === 'openrouter' ? 'block' : 'none';
    if (paneGroq) paneGroq.style.display = provider === 'groq' ? 'block' : 'none';
    if (paneGemini) paneGemini.style.display = provider === 'gemini' ? 'block' : 'none';

  }

  async openAiSettingsModal() {
    const modal = document.getElementById('aiSettingsModal');
    if (!modal) return;

    const provider = (await VaultDB.getAiProvider()) || 'openrouter';
    const orKey = await VaultDB.getOpenRouterKey();
    const orModel = (await VaultDB.getOpenRouterModel()) || 'openrouter/free';
    const groqKey = await VaultDB.getGroqKey();
    const groqModel = (await VaultDB.getGroqModel()) || 'whisper-large-v3-turbo';
    const geminiKey = await VaultDB.getGeminiKey();
    const geminiModel = (await VaultDB.getGeminiModel()) || 'gemini-3.5-transcribe';
    const aiGeneral = await VaultDB.getAiGeneralEnabled();

    const provSel = document.getElementById('modalAiProviderSelect');
    if (provSel) provSel.value = provider;
    this.switchAiProviderModal(provider);

    const orInp = document.getElementById('modalOpenRouterApiKey');
    const orSel = document.getElementById('modalOpenRouterModel');
    if (orInp) orInp.value = orKey || '';
    if (orSel) orSel.value = orModel;

    const groqInp = document.getElementById('modalGroqApiKey');
    const groqSel = document.getElementById('modalGroqModel');
    if (groqInp) groqInp.value = groqKey || '';
    if (groqSel) groqSel.value = groqModel;

    const geminiInp = document.getElementById('modalGeminiApiKey');
    const geminiSel = document.getElementById('modalGeminiModel');
    if (geminiInp) geminiInp.value = geminiKey || '';
    if (geminiSel) geminiSel.value = geminiModel;

    const chk = document.getElementById('chkAiGeneralEnabled');
    if (chk) chk.checked = aiGeneral === true;

    modal.classList.add('open');
  }

  toggleModalKeyVisibility(targetId = 'modalOpenRouterApiKey') {
    const inp = document.getElementById(targetId);
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  async toggleAiGeneralFeatures(enabled) {
    await VaultDB.saveAiGeneralEnabled(enabled);
    this.showToast(
      enabled
        ? '🤖 General AI features enabled (AI Video Director, Lyric Polisher, Prompt Assist).'
        : 'General AI features turned OFF. Audio alignment has its own action; Tap-to-Sync works locally.',
      'cyan'
    );
  }

  async saveAiSettingsModal() {
    const provSel = document.getElementById('modalAiProviderSelect');
    const provider = (provSel && provSel.value) || 'openrouter';
    await VaultDB.saveAiProvider(provider);

    const orInp = document.getElementById('modalOpenRouterApiKey');
    const orSel = document.getElementById('modalOpenRouterModel');
    const orKey = (orInp && orInp.value.trim()) || '';
    const orModel = (orSel && orSel.value) || 'openrouter/free';
    await VaultDB.saveOpenRouterKey(orKey);
    await VaultDB.saveOpenRouterModel(orModel);

    const groqInp = document.getElementById('modalGroqApiKey');
    const groqSel = document.getElementById('modalGroqModel');
    const groqKey = (groqInp && groqInp.value.trim()) || '';
    const groqModel = (groqSel && groqSel.value) || 'whisper-large-v3-turbo';
    await VaultDB.saveGroqKey(groqKey);
    await VaultDB.saveGroqModel(groqModel);

    const geminiInp = document.getElementById('modalGeminiApiKey');
    const geminiSel = document.getElementById('modalGeminiModel');
    const geminiKey = (geminiInp && geminiInp.value.trim()) || '';
    const geminiModel = (geminiSel && geminiSel.value) || 'gemini-3.5-transcribe';
    await VaultDB.saveGeminiKey(geminiKey);
    await VaultDB.saveGeminiModel(geminiModel);

    const chk = document.getElementById('chkAiGeneralEnabled');
    const aiGeneral = chk ? chk.checked : true;
    await VaultDB.saveAiGeneralEnabled(aiGeneral);

    // Sync studio inputs
    const studioProv = document.getElementById('studioAiProvider');
    if (studioProv) studioProv.value = provider;
    this.switchAiProvider(provider);

    const studioOrInp = document.getElementById('openRouterApiKeyInput');
    const studioOrSel = document.getElementById('openRouterModelSelect');
    if (studioOrInp) studioOrInp.value = orKey;
    if (studioOrSel) studioOrSel.value = orModel;

    const studioGroqInp = document.getElementById('groqApiKeyInput');
    const studioGroqSel = document.getElementById('groqModelSelect');
    if (studioGroqInp) studioGroqInp.value = groqKey;
    if (studioGroqSel) studioGroqSel.value = groqModel;

    const studioGeminiInp = document.getElementById('geminiApiKeyInput');
    const studioGeminiSel = document.getElementById('geminiModelSelect');
    if (studioGeminiInp) studioGeminiInp.value = geminiKey;
    if (studioGeminiSel) studioGeminiSel.value = geminiModel;

    document.getElementById('aiSettingsModal')?.classList.remove('open');
    this.showToast('Saved AI Provider & Free Configuration ($0 budget)!', 'emerald');
  }

  /**
   * Unified 1-Click AI Auto-Sync Engine
   * Dispatches to Groq Whisper ($0), Google AI Studio ($0), or OpenRouter (:free $0)
   */
  async loadStudioAiSettings() {
    const provider = await VaultDB.getAiProvider();
    const settings = [
      ['openRouter', await VaultDB.getOpenRouterKey(), await VaultDB.getOpenRouterModel()],
      ['groq', await VaultDB.getGroqKey(), await VaultDB.getGroqModel()],
      ['gemini', await VaultDB.getGeminiKey(), await VaultDB.getGeminiModel()]
    ];
    for (const [prefix, key, model] of settings) {
      const input = document.getElementById(prefix + 'ApiKeyInput');
      const select = document.getElementById(prefix + 'ModelSelect');
      if (input) input.value = key;
      if (select) select.value = model;
    }
    this.switchAiProvider(provider, false);
    this.updateLyricsSyncSummary();
  }

  updateLyricsSyncSummary() {
    if (this._lyricSyncOperation) return;
    const editor = document.getElementById('videoLyricsTextarea');
    const status = document.getElementById('openRouterSyncStatus');
    let count;
    try { count = LyricAlignment.parseLines(editor ? editor.value : '').length; }
    catch (error) { if (status) status.textContent = error.message; return; }
    if (status) status.textContent = count
      ? `${count} lyric line${count === 1 ? '' : 's'} detected in the editor. Auto-Sync will keep your words and match them to the singing.`
      : 'The editor is empty. Auto-Sync will transcribe the singing; paste your lyrics first to keep your own wording.';
  }

  async runAiAutoSync(providerOverride = null) {
    if (this._lyricSyncOperation) return;
    if (!this.videoStudio || !this.activeStudioSong) return;
    const editor = document.getElementById('videoLyricsTextarea');
    const operation = {
      studio: this.videoStudio, song: this.activeStudioSong, uuid: this.activeStudioSong.uuid,
      text: editor ? editor.value : '', revision: this._lyricsRevision || 0,
      provider: providerOverride || document.getElementById('studioAiProvider')?.value || 'groq'
    };
    this._lyricSyncOperation = operation; // Lock before the first await.
    const btn = document.getElementById('btnRunAiAutoSync');
    const status = document.getElementById('openRouterSyncStatus');
    const oldLabel = btn?.textContent;
    const setStatus = text => { if (status) status.textContent = text; };
    if (btn) { btn.disabled = true; btn.textContent = 'Reading editor lyrics…'; }
    try {
      const provider = operation.provider;
      const prefix = provider === 'openrouter' ? 'openRouter' : provider;
      const model = document.getElementById(prefix + 'ModelSelect')?.value || await VaultDB.getProviderModel(provider);
      AiPolicy.assertAllowed(provider, model, true);
      const key = document.getElementById(prefix + 'ApiKeyInput')?.value.trim() || await VaultDB.readSetting(provider + '_api_key', '');
      if (!key) {
        document.getElementById('openRouterConfigSection').style.display = 'block';
        throw new Error(`Enter your ${provider === 'groq' ? 'Groq' : 'Google'} free-account key in Configure Key first.`);
      }
      // Never claim that a model name alone proves the supplied account is unbilled.
      if (!document.getElementById('confirmFreeAudioAccount')?.checked) {
        throw new Error('Confirm below that this key uses a free account with billing disabled before uploading audio. Tap-to-Sync needs no key or upload.');
      }
      const provided = LyricAlignment.parseLines(operation.text);
      setStatus(provided.length ? `Detected ${provided.length} editor lines. Preparing audio to match your words…` : 'No editor lyrics. Preparing audio for transcription…');
      if ((Number(operation.song.duration) || 0) > 1800) throw new Error('Auto-Sync accepts tracks up to 30 minutes. Trim this track first, or use Tap-to-Sync.');
      const { audioBuffer } = await this.getDecryptedAudio(operation.uuid, setStatus);
      const duration = audioBuffer.duration;
      if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) throw new Error('Auto-Sync needs a valid track of at most 30 minutes.');
      // If demixed vocals already exist, their original timeline is retained.
      let syncBuffer = audioBuffer;
      const stems = await VaultDB.getStems(operation.uuid);
      if (stems?.vocalsWav) {
        try {
          const vocals = await AudioConverter.decodeAudioData(stems.vocalsWav);
          if (Math.abs(vocals.duration - duration) < 0.25) syncBuffer = vocals;
        } catch { /* A damaged optional cache must not prevent using the master. */ }
      }
      const mp3 = await Mp3Encoder.encode(syncBuffer, 96, pct => setStatus(`Encoding audio for ${provider}: ${pct}%`));
      const maxBytes = provider === 'groq' ? 25 * 1000 * 1000 : 14 * 1000 * 1000;
      if (!mp3.size || mp3.size > maxBytes) throw new Error('This audio exceeds the provider upload limit. Trim it first or use Tap-to-Sync.');
      this.assertCurrentLyricSync(operation);
      let data;
      if (provider === 'groq') {
        const formData = new FormData();
        formData.append('file', mp3, 'vocals.mp3');
        formData.append('model', model);
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');
        formData.append('timestamp_granularities[]', 'segment');
        formData.append('temperature', '0');
        if (provided.length) formData.append('prompt', provided.join(' ').split(/\s+/).slice(0, 100).join(' ').slice(0, 600));
        setStatus('Listening for sung words and their timestamps…');
        data = await AiPolicy.request('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: formData
        });
      } else {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not prepare audio upload.'));
          reader.readAsDataURL(mp3);
        });
        const prompt = `Listen to the sung audio. Return ONLY JSON with words:[{word:string,start:number,end:number}] and segments:[{text:string,start:number,end:number}]. All times are seconds measured from the start of this audio. Include every audible sung word in chronological order, including repeated choruses. Do not invent timestamps or words for instruments or silence. ${provided.length ? 'Use these exact lyrics as the spelling reference, keeping every occurrence:\n' + provided.join('\n') : 'Transcribe the sung words in their original language.'}`;
        setStatus('Listening for sung words with Google…');
        const response = await AiPolicy.request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/mp3', data: base64 } }] }] })
        });
        const raw = response.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
        try { data = JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')); }
        catch { throw new Error('Google did not return word timestamps. Your lyrics are unchanged. Try Groq Whisper or Tap-to-Sync.'); }
      }
      this.assertCurrentLyricSync(operation);
      const words = data.words;
      if (!Array.isArray(words) || !words.length) throw new Error('No sung-word timestamps were returned. Your lyrics are unchanged. Try another approved model or Tap-to-Sync.');
      let source = operation.text;
      if (!provided.length) {
        // Transcribe only when the editor was genuinely empty. Prefer provider phrases.
        source = Array.isArray(data.segments) ? data.segments.map(s => String(s.text || '').trim()).filter(Boolean).join('\n') : '';
        if (!source) {
          const lines = []; let line = [];
          words.forEach((word, index) => {
            if (line.length && (line.length >= 8 || Number(word.start) - Number(words[index - 1].end) > 0.8)) { lines.push(line.join(' ')); line = []; }
            line.push(String(word.word || word.text || '').trim());
          });
          if (line.length) lines.push(line.join(' '));
          source = lines.join('\n');
        }
      }
      const alignment = LyricAlignment.align(source, words, duration);
      const lrc = LyricAlignment.toLrc(alignment.cues);
      this.assertCurrentLyricSync(operation);
      const timing = { sourceText: lrc, duration, cues: alignment.cues, provider, model };
      if (editor) editor.value = lrc;
      operation.song.customLyrics = lrc;
      operation.song.lyricTiming = timing;
      operation.song.duration = duration;
      operation.studio.setCustomLyrics(lrc, duration, timing);
      const songs = StorageManager.loadSongs();
      const index = songs.findIndex(song => song.uuid === operation.uuid);
      if (index !== -1) { songs[index] = { ...songs[index], customLyrics: lrc, lyricTiming: timing, duration }; StorageManager.saveSongs(songs); }
      const count = alignment.cues.length;
      const badge = document.getElementById('videoLyricCuesCount');
      if (badge) badge.textContent = `${count} cues`;
      const label = document.getElementById('videoLyricsStatusText');
      if (label) label.textContent = `${count} lines matched to sung-word timestamps. Listen to check the result.`;
      setStatus(`${provided.length ? 'Your editor lyrics were kept' : 'Sung lyrics transcribed'}: ${count} lines aligned. Preview to check the timing.`);
      this.redrawStaticVideoPreview(0);
      this.showToast('Lyrics matched to the singing. Your words and measured timings are saved.', 'emerald');
      await this.restartVideoPreview();
    } catch (error) {
      setStatus(error.message);
      this.showToast(error.message, 'amber');
    } finally {
      if (this._lyricSyncOperation === operation) this._lyricSyncOperation = null;
      if (btn) { btn.disabled = false; btn.textContent = oldLabel || 'Align editor lyrics to singing'; }
    }
  }

  assertCurrentLyricSync(operation) {
    const text = document.getElementById('videoLyricsTextarea')?.value || '';
    if (this._lyricSyncOperation !== operation || this.activeStudioSong !== operation.song || this.videoStudio !== operation.studio || text !== operation.text || (this._lyricsRevision || 0) !== operation.revision || !document.getElementById('videoStudioModal')?.classList.contains('open')) {
      throw new Error('The song or editor changed during alignment. The result was discarded; your current lyrics are unchanged.');
    }
  }

  async runGroqWhisperSync() { return this.runAiAutoSync('groq'); }
  async runGeminiDirectSync() { return this.runAiAutoSync('gemini'); }


  /**
   * General Text / JSON Completion via OpenRouter for in-app AI features
   */
  async callOpenRouterText(systemPrompt, userPrompt, preferredModel = null) {
    const isEnabled = await VaultDB.getAiGeneralEnabled();
    if (!isEnabled) {
      throw new Error('General AI features are currently turned OFF. Enable them in AI Keys to use this tool.');
    }

    const key = (document.getElementById('openRouterApiKeyInput')?.value || '').trim() || (await VaultDB.getOpenRouterKey());
    if (!key) {
      throw new Error('Please enter your OpenRouter API key in AI Keys to use AI features.');
    }

    const defaultModel = (await VaultDB.getOpenRouterModel()) || 'openrouter/free';
    const model = preferredModel || defaultModel;
    AiPolicy.assertAllowed('openrouter', model);

    const data = await AiPolicy.request('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], provider: { max_price: { prompt: 0, completion: 0 } } })
    });

    return data.choices && data.choices[0]?.message?.content ? data.choices[0].message.content : (data.text || '');
  }

  /**
   * 🪄 AI Video Director: Automatically styles theme, visualizer, particles, motion & transitions
   */
  async aiAutoStyleVideo() {
    if (!this.videoStudio || !this.activeStudioSong) {
      this.showToast('No active song selected in Video Studio.', 'amber');
      return;
    }

    const title = this.activeStudioSong.title || 'Untitled Track';
    const tags = this.activeStudioSong.tags || '';
    const lyrics = this.videoStudio.customLyricsText || this.activeStudioSong.prompt || '';
    const sampleLyrics = lyrics.slice(0, 450);

    this.showToast('🪄 AI Video Director analyzing song mood & aesthetic...', 'cyan');

    try {
      const systemPrompt = `You are an elite music video creative director.
Your job is to analyze song metadata and choose the most visually stunning, atmospheric aesthetic combination.
Valid Themes: "sunset", "cyberpunk", "neon_nights", "emerald", "gold_luxury", "monochrome", "blood_moon", "ocean_deep", "synthwave".
Valid Visualizer Styles: "bars", "wave", "radial", "orb", "blocks", "spectrum_dots", "cinema_ribbon", "none".
Valid Particle Styles: "dust", "starfield", "embers", "constellation", "ripples", "gold_dust", "lightning", "aurora", "firestorm".
Valid Camera Motions: "ken-burns-dynamic", "ken-burns", "zoom_out", "pan_drift", "handheld", "dutch_angle", "slow_shimmer", "pulse", "hyperspace", "heartbeat", "static".
Valid Slide Transitions: "crossfade", "film_burn", "slide_left", "slide_right", "slide_up", "zoom_in", "zoom_out", "blur_dissolve", "circle_wipe", "shutter_split", "fade_black", "glitch_slice".

Respond ONLY with a valid JSON object (no markdown formatting, no other text):
{
  "theme": "chosen_theme",
  "visualStyle": "chosen_style",
  "particleStyle": "chosen_particles",
  "bgMotion": "chosen_motion",
  "slideTransition": "chosen_transition",
  "rationale": "One concise sentence explaining why this matches the song vibe."
}`;

      const userPrompt = `Song Title: "${title}"\nGenre/Tags: "${tags}"\nLyrics snippet:\n"""\n${sampleLyrics}\n"""`;
      const responseText = await this.callOpenRouterText(systemPrompt, userPrompt);

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI director did not return valid JSON.');
      const plan = JSON.parse(jsonMatch[0]);

      if (plan.theme && this.videoStudio.themes[plan.theme]) {
        this.videoStudio.theme = plan.theme;
        this.videoStudio.currentThemeColors = this.videoStudio.themes[plan.theme];
      }
      if (plan.visualStyle) {
        this.videoStudio.visualStyle = plan.visualStyle;
        const vsSelect = document.getElementById('videoVisualStyle');
        if (vsSelect) vsSelect.value = plan.visualStyle;
      }
      if (plan.particleStyle) {
        this.videoStudio.particleStyle = plan.particleStyle;
        const psSelect = document.getElementById('videoParticleStyle');
        if (psSelect) psSelect.value = plan.particleStyle;
      }
      if (plan.bgMotion) {
        this.videoStudio.bgMotion = plan.bgMotion;
        const bmSelect = document.getElementById('videoBgMotion');
        if (bmSelect) bmSelect.value = plan.bgMotion;
      }
      if (plan.slideTransition) {
        this.videoStudio.slideTransition = plan.slideTransition;
        const stSelect = document.getElementById('videoSlideTransition');
        if (stSelect) stSelect.value = plan.slideTransition;
      }

      this.saveVideoStudioSettings();
      if (!this.videoStudio.isPreviewing && !this.videoStudio.isRecording) {
        this.redrawStaticVideoPreview();
      }

      this.showToast(`🪄 AI Director: ${plan.rationale || 'Aesthetic applied!'}`, 'emerald');
    } catch (err) {
      this.showToast(`AI Director: ${err.message}`, 'rose');
    }
  }

  /**
   * ✨ AI Lyric Polish & Structure: Formats verses, choruses, bridges and fixes capitalization/punctuation
   */
  async aiPolishLyrics() {
    const textarea = document.getElementById('videoLyricsTextarea');
    const text = textarea ? textarea.value.trim() : '';
    if (!text || text.length < 5) {
      this.showToast('Please type or paste some lyrics into the editor first.', 'amber');
      return;
    }

    this.showToast('✨ AI polishing punctuation, capitalization, and song structure...', 'cyan');

    try {
      const systemPrompt = `You are a professional music editor and lyricist.
Your job is to polish song lyrics:
1. Fix typos, capitalization, and punctuation cleanly.
2. Organize into standard verse/chorus/bridge/outro stanzas if missing.
3. If timestamps [mm:ss.xx] are present, PRESERVE THEM EXACTLY.
4. Output ONLY the polished lyric text. No markdown blocks (\`\`\`), no commentary.`;

      const polished = await this.callOpenRouterText(systemPrompt, text);
      const clean = polished.replace(/^```[a-z]*\r?\n/i, '').replace(/\r?\n```$/g, '').trim();
      if (clean) {
        if (textarea) textarea.value = clean;
        this.updateVideoLyricsText();
        this.showToast('✨ Lyrics polished & structured successfully!', 'emerald');
      }
    } catch (err) {
      this.showToast(`AI Lyric Polish Error: ${err.message}`, 'rose');
    }
  }

  async runOpenRouterAutoSync() { return this.runAiAutoSync('openrouter'); }

  /* =========================================================================
     ARTWORK, LYRICS (.TXT / .LRC / .SRT) & DECK RENDERING
     ========================================================================= */

  async downloadCover(uuid) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song || !song.imageLarge) {
      this.showToast('No external cover artwork URL for this track.', 'amber');
      return;
    }

    try {
      const resp = await fetch(song.imageLarge);
      if (!resp.ok) throw new Error('Cover art fetch failed');
      const blob = await resp.blob();
      const filename = this.makeSafeFilename(song.title, 'jpeg');
      this.triggerDownload(blob, filename);
      this.showToast(`Downloaded Cover Art "${filename}"!`, 'emerald');
    } catch (e) {
      window.open(song.imageLarge, '_blank');
      this.showToast('Opened cover art in new tab!', 'amber');
    }
  }

  downloadLyrics(uuid, format = 'txt') {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;

    let content = '';
    let ext = 'txt';
    let label = 'Lyrics TXT';

    if (format === 'lrc') {
      content = LyricsUtils.toLrc(song, song.duration || 180);
      ext = 'lrc';
      label = 'Synchronized Karaoke LRC';
    } else if (format === 'srt') {
      content = LyricsUtils.toSrt(song, song.duration || 180);
      ext = 'srt';
      label = 'Video Subtitles SRT';
    } else {
      content = LyricsUtils.toTxt(song);
      ext = 'txt';
      label = 'Lyrics Sheet TXT';
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const filename = this.makeSafeFilename(`${song.title} - Lyrics`, ext);
    this.triggerDownload(blob, filename);
    this.showToast(`Downloaded ${label}: "${filename}"`, 'emerald');
  }

  async togglePlayAudio(uuid) {
    try {
      this.stopAllModalAudio();
      const { decryptedBuffer } = await this.getDecryptedAudio(uuid, (status) => {
        this.showToast(status, 'emerald');
      });

      // Detect audio container MIME type
      let mimeType = 'audio/mp4';
      if (decryptedBuffer && decryptedBuffer.byteLength >= 4) {
        const header = new Uint8Array(decryptedBuffer.slice(0, 12));
        if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
          mimeType = 'audio/wav';
        } else if ((header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) ||
                   (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0)) {
          mimeType = 'audio/mpeg';
        }
      }

      const blob = new Blob([decryptedBuffer], { type: mimeType });
      const canvasEl = document.getElementById(`wave-canvas-${uuid}`);
      await this.player.play(uuid, blob, 'master', canvasEl);
    } catch (e) {
      console.error('Audio playback error:', e);
      this.showToast(`Playback error: ${e.message}`, 'rose');
    }
  }

  getPlatformIcon(platform) {
    const p = String(platform || '').toLowerCase();
    if (p.includes('youtube')) return '🔴';
    if (p.includes('tiktok')) return '🎵';
    if (p.includes('soundcloud')) return '☁️';
    if (p.includes('suno')) return '🪄';
    if (p.includes('video')) return '🎬';
    if (p.includes('audio')) return '📂';
    if (p.includes('instagram')) return '📸';
    if (p.includes('twitter') || p.includes('x')) return '🐦';
    return '⚡';
  }

  getPlatformBadgeClass(platform) {
    const p = String(platform || '').toLowerCase();
    if (p.includes('youtube')) return 'badge-youtube';
    if (p.includes('tiktok')) return 'badge-tiktok';
    if (p.includes('soundcloud')) return 'badge-soundcloud';
    if (p.includes('suno')) return 'badge-amber';
    if (p.includes('video')) return 'badge-video';
    return 'badge-cyan';
  }

  renderSongs() {
    const container = document.getElementById('songsContainer');
    const countBadge = document.getElementById('songCountBadge');
    const songs = StorageManager.loadSongs();

    if (countBadge) countBadge.textContent = songs.length;
    if (!container) return;

    if (songs.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 2.75rem 1.5rem; border-style: dashed;">
          <div style="font-size: 2.4rem; margin-bottom: 0.65rem;">🎛️</div>
          <h3 style="font-size: 1.12rem; font-weight: 800; margin-bottom: 0.35rem;">NTK SoundLab Deck Ready</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 540px; margin: 0 auto 1.25rem;">
            Paste any streaming link above (YouTube, TikTok, SoundCloud, Suno, Instagram, Twitter/X, direct streams), or drop video and audio files to run Meta HTDemucs v4 2-Stem / 4-Stem AI separation, Mastering FX, and 1080p Karaoke Video rendering.
          </p>
          <div style="display:flex;justify-content:center;gap:0.65rem;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="app.pasteAndResolveClipboard()">
              📋 Smart Clipboard Grab
            </button>
            <button class="btn btn-cyan btn-sm" onclick="document.getElementById('localAudioFileInput').click()">
              📂 Import Video or Audio
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = songs.map((song) => {
      const safeTitle = this.escapeHtml(song.title);
      const isLocal = String(song.uuid).startsWith('local-') || String(song.uuid).startsWith('video-');
      const isOfficialEmbed = !isLocal && song.playerMode === 'suno' && song.platform === 'Suno AI';
      const cleanId = song.uuid.toLowerCase().trim();
      const hasVaultMaster = this.vaultSummary.masterIds.has(cleanId);
      const hasVaultStems = this.vaultSummary.stemIds.has(cleanId);
      const fallbackImg = 'assets/icon.svg';

      return `
        <article class="song-card" id="card-${song.uuid}">
          <!-- Main Info Row -->
          <div class="song-main-row">
            <div class="song-cover-container" onclick="app.downloadCover('${song.uuid}')" title="Click to download full-res artwork">
              <img
                src="${this.escapeHtml(song.imageLarge || fallbackImg)}"
                alt="${safeTitle}"
                class="song-cover-img"
                onerror="this.onerror=null;this.src='${fallbackImg}';"
              />
            </div>

            <div class="song-info">
              <div class="song-title-row">
                <input
                  type="text"
                  value="${safeTitle}"
                  onchange="app.renameSong('${song.uuid}', this.value)"
                  class="song-title-input"
                  title="Click to rename (updates exported filenames & ID3 tags)"
                />
                <button
                  onclick="app.removeSong('${song.uuid}')"
                  class="btn btn-ghost btn-sm"
                  title="Remove from deck"
                >
                  ✕
                </button>
              </div>

              <div class="song-meta-tags">
                <span class="tag-badge ${this.getPlatformBadgeClass(song.platform || 'Universal')}">
                  ${this.getPlatformIcon(song.platform || 'Universal')} ${this.escapeHtml(song.platform || 'Universal')}
                </span>
                ${song.artist ? `<span class="tag-badge" style="color:#fde68a;border-color:rgba(245,158,11,0.3)">👤 ${this.escapeHtml(song.artist)}</span>` : ''}
                ${song.album ? `<span class="tag-badge" style="color:#a7f3d0;border-color:rgba(16,185,129,0.3)">💿 ${this.escapeHtml(song.album)}</span>` : ''}
                ${song.hasVideo ? `<span class="tag-badge badge-video">🎬 Video</span>` : ''}
                ${hasVaultMaster ? `<span class="tag-badge vault-master" title="Lossless audio stream cached in IndexedDB Offline Vault">💾 Cached Offline</span>` : ''}
                ${hasVaultStems ? `<span class="tag-badge vault-stems" title="Neural stems cached & ready instantly">🎚️ Stems Ready</span>` : ''}
                ${song.url ? `
                  <a
                    href="${this.escapeHtml(song.url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="tag-badge"
                    style="text-decoration:none;color:var(--text-secondary)"
                  >
                    Source Page ↗
                  </a>
                ` : ''}
              </div>

              ${song.prompt ? `
                <p class="song-lyrics-preview" title="${this.escapeHtml(song.prompt)}">
                  "${this.escapeHtml(song.prompt.slice(0, 180))}${song.prompt.length > 180 ? '...' : ''}"
                </p>
              ` : ''}
            </div>
          </div>

          <!-- Dual Player Container -->
          <div class="song-player-container">
            <div class="player-mode-tabs">
              <div class="player-tab-buttons">
                <button
                  class="player-tab-btn ${!isOfficialEmbed ? 'active' : ''}"
                  onclick="app.switchPlayerMode('${song.uuid}', 'custom')"
                >
                  ⚡ Studio Player (Waveform)
                </button>
                ${!isLocal ? `
                  <button
                    class="player-tab-btn ${isOfficialEmbed ? 'active' : ''}"
                    onclick="app.switchPlayerMode('${song.uuid}', 'suno')"
                  >
                    ▶ Official Suno Stream
                  </button>
                ` : ''}
              </div>
              <span style="font-size: 0.7rem; color: var(--text-muted)">${hasVaultMaster ? 'Instant Vault Stream' : 'High-Fidelity Stream'}</span>
            </div>

            ${!isOfficialEmbed ? `
              <div class="custom-audio-player">
                <div class="player-controls-row">
                  <button
                    id="btn-play-${song.uuid}"
                    class="btn-play-pause"
                    onclick="app.togglePlayAudio('${song.uuid}')"
                    title="Play / Pause"
                  >
                    ${this.player.currentSongUuid === song.uuid && this.player.isPlaying ? '❚❚' : '▶'}
                  </button>

                  <div class="waveform-scrubber">
                    <canvas
                      id="wave-canvas-${song.uuid}"
                      class="waveform-canvas"
                      width="500"
                      height="38"
                      onclick="app.handleScrubberClick('${song.uuid}', event)"
                    ></canvas>
                    <div class="player-time-row">
                      <span id="time-cur-${song.uuid}">0:00</span>
                      <span id="time-dur-${song.uuid}">${this.formatDuration(song.duration)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ` : `
              <div class="suno-iframe-wrapper">
                <iframe
                  src="https://suno.com/embed/${song.uuid}"
                  class="suno-iframe"
                  allow="autoplay; encrypted-media; fullscreen"
                  loading="lazy"
                ></iframe>
              </div>
            `}
          </div>

          <!-- Primary Studio Action Matrix (6 Cards) -->
          <div class="download-matrix">
            <button
              id="btn-m4a-${song.uuid}"
              class="dl-button-card primary"
              onclick="app.downloadM4a('${song.uuid}')"
              title="Download untouched AAC master stream"
            >
              <div class="dl-btn-format">
                <span>Master M4A</span>
                <span>⚡</span>
              </div>
              <span class="dl-btn-desc">Original Bit-Perfect</span>
            </button>

            <button
              id="btn-wav-${song.uuid}"
              class="dl-button-card"
              onclick="app.downloadWav('${song.uuid}')"
              title="Download lossless 16-bit Studio Master WAV"
            >
              <div class="dl-btn-format">
                <span>Studio WAV</span>
                <span>💎</span>
              </div>
              <span class="dl-btn-desc">Lossless 16-Bit PCM</span>
            </button>

            <button
              id="btn-mp3-${song.uuid}"
              class="dl-button-card"
              onclick="app.downloadMp3('${song.uuid}')"
              title="Download 320kbps MP3 with embedded Cover Art, Title, Genre & Lyrics"
            >
              <div class="dl-btn-format">
                <span>MP3 320k</span>
                <span>🏷️</span>
              </div>
              <span class="dl-btn-desc">ID3 + Art + Lyrics</span>
            </button>

            <button
              id="btn-stems-${song.uuid}"
              class="dl-button-card"
              style="background:rgba(6,182,212,0.13);border-color:rgba(6,182,212,0.38)"
              onclick="app.openStemsStudio('${song.uuid}')"
              title="Separate Vocals & Instrumental (2-Stem) or Full 4-Stem/5-Stem Studio Kit"
            >
              <div class="dl-btn-format">
                <span style="color:#67e8f9">2 / 4 Stem AI</span>
                <span>🎛️</span>
              </div>
              <span class="dl-btn-desc">Vocals + Stems</span>
            </button>

            <button
              id="btn-fx-${song.uuid}"
              class="dl-button-card fx"
              onclick="app.openTrimFxStudio('${song.uuid}')"
              title="Trim start/end, add fades, normalize, or apply Slowed+Reverb / Nightcore / Bass Boost"
            >
              <div class="dl-btn-format">
                <span style="color:#6ee7b7">Trim &amp; FX</span>
                <span>✂️</span>
              </div>
              <span class="dl-btn-desc">Master &amp; Presets</span>
            </button>

            <button
              id="btn-video-${song.uuid}"
              class="dl-button-card video"
              onclick="app.openVideoStudio('${song.uuid}')"
              title="Open 1080p Karaoke Lyrics & Visualizer Video Studio"
            >
              <div class="dl-btn-format">
                <span style="color:#c4b5fd">Video Studio</span>
                <span>🎬</span>
              </div>
              <span class="dl-btn-desc">1080p + Karaoke</span>
            </button>
          </div>

          <!-- Secondary Packaging, Subtitles & Artwork Bar -->
          <div class="song-secondary-actions">
            <div style="display:flex;gap:0.45rem;flex-wrap:wrap">
              <button
                id="btn-pack-${song.uuid}"
                class="btn btn-accent btn-sm"
                onclick="app.downloadSongPackZip('${song.uuid}')"
                title="Bundle M4A + Tagged 320k MP3 + Cover Art + TXT/LRC/SRT (+ Cached Stems) into one .ZIP"
              >
                📦 Complete Pack (.ZIP)
              </button>
              <button
                class="btn btn-cyan btn-sm"
                onclick="app.openMetaModal('${song.uuid}')"
                title="Edit Title, Artist, Album, Track Number, Year, Genre, Lyrics & Cover Art"
              >
                🏷️ Edit Tags
              </button>
              <button
                class="btn btn-secondary btn-sm"
                onclick="app.downloadCover('${song.uuid}')"
              >
                🖼 Artwork
              </button>
              <button
                class="btn btn-secondary btn-sm"
                onclick="app.downloadLyrics('${song.uuid}', 'txt')"
                title="Download plain text lyrics & metadata sheet"
              >
                📝 .TXT
              </button>
              <button
                class="btn btn-secondary btn-sm"
                onclick="app.downloadLyrics('${song.uuid}', 'lrc')"
                title="Download synchronized karaoke .LRC file"
              >
                🎤 .LRC
              </button>
              <button
                class="btn btn-secondary btn-sm"
                onclick="app.downloadLyrics('${song.uuid}', 'srt')"
                title="Download video subtitle .SRT captions"
              >
                💬 .SRT
              </button>
              ${!isLocal ? `
                <button
                  class="btn btn-secondary btn-sm"
                  onclick="app.openHelperModal('${song.uuid}')"
                >
                  🖥️ CLI
                </button>
              ` : ''}
            </div>

            <button
              class="btn btn-ghost btn-sm"
              onclick="app.toggleSongDetails('${song.uuid}')"
            >
              ${song.showDetails ? 'Hide Diagnostics' : 'Diagnostics'}
            </button>
          </div>

          ${song.showDetails ? `
            <div class="code-box" style="flex-direction:column;align-items:flex-start;gap:0.45rem">
              <div><strong>UUID:</strong> <code>${this.escapeHtml(song.uuid)}</code></div>
              ${song.streamUrl ? `<div><strong>CloudFront Stream:</strong> <a href="${this.escapeHtml(song.streamUrl)}" target="_blank" style="color:var(--accent-amber)">${this.escapeHtml(song.streamUrl)}</a></div>` : ''}
              ${song.imageLarge ? `<div><strong>Cover Art URL:</strong> <a href="${this.escapeHtml(song.imageLarge)}" target="_blank" style="color:var(--accent-amber)">${this.escapeHtml(song.imageLarge)}</a></div>` : ''}
              <div><strong>Offline Vault:</strong> Master=${hasVaultMaster ? 'Cached' : 'Not cached'} • 4-Track Stems=${hasVaultStems ? 'Cached' : 'Not cached'}</div>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');
  }

  switchPlayerMode(uuid, mode) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;
    song.playerMode = mode;
    StorageManager.upsertSong(song);
    this.renderSongs();
  }

  toggleSongDetails(uuid) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;
    song.showDetails = !song.showDetails;
    StorageManager.upsertSong(song);
    this.renderSongs();
  }

  renameSong(uuid, newTitle) {
    const song = StorageManager.loadSongs().find((s) => s.uuid === uuid);
    if (!song) return;
    song.title = newTitle.trim() || song.title;
    StorageManager.upsertSong(song);
    this.showToast(`Renamed to "${song.title}"`, 'emerald');
  }

  async removeSong(uuid) {
    if (this.player.currentSongUuid === uuid) {
      this.player.pause();
    }
    StorageManager.removeSong(uuid);
    await VaultDB.deleteSongAssets(uuid);
    await this.refreshVaultSummary(false);
    this.renderSongs();
    this.showToast('Removed song from deck.', 'amber');
  }

  handleScrubberClick(uuid, event) {
    const canvas = document.getElementById(`wave-canvas-${uuid}`);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const dur = this.player.audioElement.duration || 0;
    if (dur > 0 && this.player.currentSongUuid === uuid) {
      this.player.seek(dur * ratio);
    }
  }

  openHelperModal(uuid = '') {
    const modal = document.getElementById('helperModal');
    if (!modal) return;
    modal.classList.add('open');

    const sampleUuid = uuid && !String(uuid).startsWith('local-')
      ? uuid
      : '<SONG_ID>';
    const cliEl = document.getElementById('helperCliCmd');
    if (cliEl) {
      cliEl.textContent = `python helper/suno_helper.py https://suno.com/song/${sampleUuid}`;
    }
  }

  setBtnLoading(btnId, isLoading, text = '') {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    if (isLoading) {
      if (!btn.dataset.origHtml) {
        btn.dataset.origHtml = btn.innerHTML;
      }
      btn.disabled = true;
      btn.innerHTML = `<span style="font-size:0.75rem">${this.escapeHtml(text)}</span>`;
    } else {
      btn.disabled = false;
      if (btn.dataset.origHtml) {
        btn.innerHTML = btn.dataset.origHtml;
        delete btn.dataset.origHtml;
      }
    }
  }

  triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  }

  makeSafeFilename(title, ext) {
    const clean = (title || 'Suno_Song')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 75) || 'Suno_Song';
    return `${clean}.${ext}`;
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  formatDuration(sec) {
    if (sec === undefined || sec === null || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  showToast(message, color = 'emerald') {
    const box = document.getElementById('toastContainer');
    if (!box) return;

    const toast = document.createElement('div');
    toast.className = `toast ${color}`;
    toast.innerHTML = `<span>✨</span><span>${this.escapeHtml(message)}</span>`;
    box.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 250);
    }, 4500);
  }

  copyToClipboard(text, message = 'Copied to clipboard!') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      this.showToast(message, 'emerald');
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      this.showToast(message, 'emerald');
    } catch (e) {}
    ta.remove();
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}

window.OmniAPI = OmniAPI;
window.VaultDB = VaultDB;
window.VideoDemuxer = VideoDemuxer;
window.app = new App();
window.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
