/**
 * Suno Downloader Pro - Player Engine
 * Manages decrypted audio playback, stem previews, and waveform visualization
 */

import { AudioConverter } from './audio-converter.js?v=2026.11.3.1';

export class PlayerEngine {
  constructor() {
    this.currentSongUuid = null;
    this.currentTrackType = 'master'; // 'master' | 'vocals' | 'instrumental'
    this.isPlaying = false;
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';
    this.audioElement.volume = 1.0;
    this.audioElement.muted = false;

    this.audioCtx = null;
    this.sourceNode = null;
    this.analyser = null;
    this.freqData = null;

    this.activeCanvas = null;
    this.activeCanvasCtx = null;
    this.animationId = null;
    this._prevObjectUrl = null;

    this.setupListeners();
  }

  setupListeners() {
    this.audioElement.addEventListener('timeupdate', () => {
      this.onTimeUpdate();
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      this.updatePlayPauseUI();
    });

    this.audioElement.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayPauseUI();
    });

    this.audioElement.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayPauseUI();
    });

    this.audioElement.addEventListener('error', (e) => {
      console.warn('Audio element error event:', e, this.audioElement.error);
    });
  }

  /**
   * Initializes Web Audio AnalyserNode for audio visualization
   */
  initWebAudio() {
    if (this.sourceNode) {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return;
    }
    try {
      this.audioCtx = AudioConverter.getAudioContext();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio element routing restricted or already bound:', e);
      if (!this.freqData) {
        this.freqData = new Uint8Array(64);
      }
    }
  }

  /**
   * Plays a blob or URL
   * @param {string} uuid
   * @param {Blob|string} audioSource
   * @param {string} trackType
   * @param {HTMLCanvasElement} [canvasEl]
   */
  async play(uuid, audioSource, trackType = 'master', canvasEl = null) {
    this.initWebAudio();

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {}
    }

    this.audioElement.volume = 1.0;
    this.audioElement.muted = false;

    const isSameTrack = this.currentSongUuid === uuid && this.currentTrackType === trackType;

    if (isSameTrack && this.audioElement.src) {
      // Toggle play/pause
      if (this.isPlaying) {
        this.pause();
      } else {
        try {
          await this.audioElement.play();
          this.isPlaying = true;
          this.updatePlayPauseUI();
          this.startWaveformLoop();
        } catch (e) {
          console.error('Audio resume failed:', e);
        }
      }
      return;
    }

    // Clean up old object URL if any
    if (this._prevObjectUrl) {
      URL.revokeObjectURL(this._prevObjectUrl);
      this._prevObjectUrl = null;
    }

    let srcUrl = '';
    if (typeof audioSource === 'string') {
      srcUrl = audioSource;
    } else if (audioSource instanceof Blob) {
      srcUrl = URL.createObjectURL(audioSource);
      this._prevObjectUrl = srcUrl;
    }

    this.currentSongUuid = uuid;
    this.currentTrackType = trackType;
    this.activeCanvas = canvasEl;
    if (canvasEl) {
      this.activeCanvasCtx = canvasEl.getContext('2d');
    }

    this.audioElement.src = srcUrl;

    try {
      await this.audioElement.play();
      this.isPlaying = true;
    } catch (err) {
      console.warn('Standard media element play failed, retrying with AudioContext resume:', err);
      if (this.audioCtx) {
        try {
          await this.audioCtx.resume();
        } catch (e2) {}
      }
      await this.audioElement.play();
      this.isPlaying = true;
    }

    this.updatePlayPauseUI();
    this.startWaveformLoop();
  }

  pause() {
    this.audioElement.pause();
    this.isPlaying = false;
    this.updatePlayPauseUI();
  }

  seek(seconds) {
    if (this.audioElement && !isNaN(seconds)) {
      this.audioElement.currentTime = seconds;
    }
  }

  setVolume(val) {
    if (this.audioElement) {
      this.audioElement.volume = Math.max(0, Math.min(1, val));
    }
  }

  onTimeUpdate() {
    const cur = this.audioElement.currentTime || 0;
    const dur = this.audioElement.duration || 0;

    const timeEl = document.getElementById(`time-cur-${this.currentSongUuid}`);
    const durEl = document.getElementById(`time-dur-${this.currentSongUuid}`);

    if (timeEl) timeEl.textContent = this.formatTime(cur);
    if (durEl && !isNaN(dur) && dur > 0) durEl.textContent = this.formatTime(dur);
  }

  updatePlayPauseUI() {
    const btn = document.getElementById(`btn-play-${this.currentSongUuid}`);
    if (btn) {
      btn.innerHTML = this.isPlaying ? '❚❚' : '▶';
    }
  }

  startWaveformLoop() {
    if (this.animationId) cancelAnimationFrame(this.animationId);

    const render = () => {
      if (this.isPlaying && this.activeCanvasCtx && this.activeCanvas) {
        if (this.analyser && this.freqData) {
          this.analyser.getByteFrequencyData(this.freqData);
        }
        this.drawWaveform();
      }
      this.animationId = requestAnimationFrame(render);
    };

    this.animationId = requestAnimationFrame(render);
  }

  drawWaveform() {
    const ctx = this.activeCanvasCtx;
    const canvas = this.activeCanvas;
    if (!ctx || !canvas) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const cur = this.audioElement.currentTime || 0;
    const dur = this.audioElement.duration || 1;
    const progress = cur / dur;

    // Draw background scrubber bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, 0, w, h);

    // Draw active progress highlight
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.fillRect(0, 0, w * progress, h);

    if (!this.freqData) {
      this.freqData = new Uint8Array(64);
    }

    // Check if frequency data has non-zero signal
    let hasSignal = false;
    for (let i = 0; i < this.freqData.length; i++) {
      if (this.freqData[i] > 0) {
        hasSignal = true;
        break;
      }
    }

    // If no raw frequency data (e.g. browser CORS-silenced media element source), simulate visualizer bars
    if (!hasSignal) {
      const t = performance.now() / 140;
      for (let i = 0; i < this.freqData.length; i++) {
        const wave = Math.sin(t + i * 0.35) * 0.5 + 0.5;
        this.freqData[i] = Math.floor(35 + wave * 170);
      }
    }

    // Draw frequency bars
    const numBars = this.freqData.length;
    const barWidth = w / numBars;

    for (let i = 0; i < numBars; i++) {
      const val = this.freqData[i];
      const barH = Math.max(3, (val / 255) * h);
      const x = i * barWidth;
      const y = (h - barH) / 2;

      ctx.fillStyle = (x / w <= progress) ? '#fbbf24' : '#64748b';
      ctx.fillRect(x + 1, y, Math.max(1, barWidth - 2), barH);
    }
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
}
