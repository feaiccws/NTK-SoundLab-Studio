import { LyricAlignment } from './lyric-alignment.js?v=2026.11.3.1';
/**
 * Suno Downloader Pro - World-Class Video Generator & Karaoke Visualizer Studio
 * Renders 1080p Full HD audio-visualizer videos with synchronized Karaoke Lyrics Burn-In,
 * 6 Kinetic Animation Templates (CapCut Spring Pop, Viral Highlighter, Liquid Wipe, Floating Wave, Glitch, Classic),
 * Custom Album Artwork & Spinning Vinyl Record Center Label, Custom Cinema Backdrops,
 * Audio-Reactive Particles, 4 Visualizer Engines, and 60 FPS Export.
 */

import { AudioConverter } from './audio-converter.js?v=2026.11.3.1';
import { LyricsUtils } from './lyrics-utils.js?v=2026.11.3.1';

export class VideoGenerator {
  static THEMES = {
    sunset: { primary: '#fbbf24', secondary: '#f43f5e', glow: '245, 158, 11' },
    cyber: { primary: '#22d3ee', secondary: '#a855f7', glow: '34, 211, 238' },
    emerald: { primary: '#34d399', secondary: '#06b6d4', glow: '52, 211, 153' },
    mono: { primary: '#f8fafc', secondary: '#94a3b8', glow: '248, 250, 252' },
    love: { primary: '#f43f5e', secondary: '#ec4899', glow: '244, 63, 94' }
  };

  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.aspectRatio = options.aspectRatio || '1:1'; // '1:1' | '16:9' | '9:16'
    this.visualStyle = options.visualStyle || 'bars'; // 'bars' | 'wave' | 'circular' | 'mirrored_bars' | 'none'
    this.showVisualizer = options.showVisualizer !== false;
    this.vizPosition = options.vizPosition || 'below_artwork'; // 'below_artwork' | 'center_screen' | 'bottom_dock' | 'around_artwork' | 'split_side'
    this.vizWidthPercent = options.vizWidthPercent || 0.74; // 0.25 .. 0.98
    this.vizMaxHeight = options.vizMaxHeight || 120; // 40 .. 260
    this.theme = options.theme || 'sunset';
    this.customColors = options.customColors || null; // { primary, secondary, glow }
    this.showLyrics = options.showLyrics !== false;

    // Custom Freeform Component Drag Positions (Normalized 0..1 coordinates)
    this.customPositions = options.customPositions ? { ...options.customPositions } : {
      artwork: null,
      visualizer: null,
      lyrics: null,
      title: null
    };
    this.lastComponentBoxes = {};
    this.activeDragComponent = null;
    this.hoveredComponent = null;
    this.dragOffset = { dx: 0, dy: 0 };
    this.showDragGuides = true;
    this.lastRenderTime = 0;

    // Studio & Brand Customization
    this.studioName = options.studioName || 'NTK Hub';
    this.studioSubtitle = options.studioSubtitle || 'Official Visualizer';
    this.watermarkPos = options.watermarkPos || 'top-left'; // 'none' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    this.showFooter = options.showFooter !== false;

    // Cinema Background Customization
    this.backgroundImage = null;
    this.customBgDataUrl = options.customBgDataUrl || null;
    this.bgFitMode = options.bgFitMode || 'cover'; // 'cover' | 'contain'
    this.bgDimOpacity = options.bgDimOpacity !== undefined ? options.bgDimOpacity : 0.40; // 0.0 .. 1.0
    this.bgBlurPx = options.bgBlurPx !== undefined ? options.bgBlurPx : 20; // 0 .. 80
    this.bgMotion = options.bgMotion || 'ken-burns'; // 'ken-burns' | 'pulse' | 'static'

    // Atmospheric Particle Field
    this.showParticles = options.showParticles !== false;
    this.particleStyle = options.particleStyle || 'dust'; // 'dust' | 'starfield' | 'embers' | 'constellation' | 'ripples' | 'rain' | 'gold_dust' | 'lightning' | 'aurora' | 'firestorm' | 'cyber_grid' | 'orbit_rings' | 'floating_hearts' | 'emoji_particles' | 'rose_petals'
    this.particleSpeed = options.particleSpeed || 1.0;
    this.particles = this._initParticles(65);

    // Multi-Slide Image Deck (The Ken Burns Storyteller)
    this.slides = options.slides || []; // Array of { img: Image, dataUrl: string }
    this.slideTransition = options.slideTransition || 'crossfade'; // 'crossfade' | 'film_burn' | 'slide_left' | 'slide_right' | 'slide_up' | 'zoom_in' | 'zoom_out' | 'blur_dissolve' | 'circle_wipe' | 'shutter_split' | 'fade_black' | 'glitch_slice' | 'heart_wipe' | 'love_bloom' | 'petal_dissolve'

    // Ad & Promo Studio Engine
    this.isAdMode = options.isAdMode || false;
    this.adConfig = {
      topHookText: options.topHookText || '',
      bottomCtaText: options.bottomCtaText || '',
      urgencyBadge: options.urgencyBadge || '',
      ctaStyle: options.ctaStyle || 'pulsing_pill'
    };

    // Artwork & Vinyl Presentation Mode
    this.artMode = options.artMode || 'card'; // 'card' | 'vinyl' | 'none'
    this.artSizeScale = options.artSizeScale || 0.44; // 0.30 .. 0.70
    this.artCornerRadius = options.artCornerRadius !== undefined ? options.artCornerRadius : 28; // number or 'circle'
    this.artGlowIntensity = options.artGlowIntensity !== undefined ? options.artGlowIntensity : 0.7;
    this.customCoverDataUrl = options.customCoverDataUrl || null;
    this.customCoverImage = null;

    // Typography & Animated Lyrics
    this.fontFamily = options.fontFamily || 'Inter'; // 'Inter' | 'Playfair Display' | 'Montserrat' | 'Orbitron'
    this.lyricPosition = options.lyricPosition || 'lower-third'; // 'lower-third' | 'center' | 'top'
    this.lyricAnimation = options.lyricAnimation || 'capcut_bounce'; // 'capcut_bounce' | 'highlighter' | 'karaoke_wipe' | 'floating_wave' | 'glitch_pulse' | 'classic'
    this.lyricStrokeWidth = options.lyricStrokeWidth !== undefined ? options.lyricStrokeWidth : 3; // 0 .. 10 px
    this.lyricStrokeColor = options.lyricStrokeColor || '#000000';
    this.lyricScrimEnabled = options.lyricScrimEnabled !== false;
    this.lyricScrimOpacity = options.lyricScrimOpacity !== undefined ? options.lyricScrimOpacity : 0.68; // 0.0 .. 1.0

    // Custom PNG Logo Watermark
    this.watermarkLogoImg = null;
    this.watermarkLogoDataUrl = options.watermarkLogoDataUrl || null;
    this.watermarkLogoSize = options.watermarkLogoSize || 80; // 30 .. 240 px
    this.watermarkLogoOpacity = options.watermarkLogoOpacity !== undefined ? options.watermarkLogoOpacity : 0.9;

    // Visualizer Audio Gain & Reactivity Sensitivity
    this.vizSensitivity = options.vizSensitivity !== undefined ? options.vizSensitivity : 1.0; // 0.5 .. 3.0

    // Multi-Slide Pacing & Transition Speed
    this.slideDurationSec = options.slideDurationSec || 0; // 0 = auto-divided
    this.slideTransitionSec = options.slideTransitionSec || 1.2; // transition window in seconds

    // Audio Stem Track Selection
    this.audioSourceType = options.audioSourceType || 'master'; // 'master' | 'instrumental' | 'vocals'

    // Video Export Quality & Resolution
    this.resolution = options.resolution || '1080p'; // '1080p' | '720p' | '480p'
    this.fps = options.fps || 60; // 30 | 60
    this.bitrateMbps = options.bitrateMbps || 12; // 3 .. 16
    this.bitrateManuallySet = Boolean(options.bitrateMbps);

    this.coverImage = null;
    this.audioBuffer = null;
    this.songMeta = options.songMeta || null;
    this.lyricCues = [];

    this.isRecording = false;
    this.isPreviewing = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.animationFrameId = null;

    this.analyser = null;
    this.sourceNode = null;
    this.audioCtx = null;
  }

  _initParticles(count) {
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        id: i,
        x: Math.random(),
        y: Math.random(),
        z: 0.05 + Math.random() * 0.95,
        prevX: 0,
        prevY: 0,
        vx: (Math.random() - 0.5) * 0.008,
        vy: (Math.random() - 0.5) * 0.008,
        size: 1.5 + Math.random() * 3.8,
        speed: 0.02 + Math.random() * 0.06,
        opacity: 0.25 + Math.random() * 0.65,
        colorType: i % 3 // 0: primary, 1: secondary, 2: white
      });
    }
    return particles;
  }

  getActivePalette() {
    if (this.customColors && this.customColors.primary) {
      return {
        primary: this.customColors.primary,
        secondary: this.customColors.secondary || this.customColors.primary,
        glow: this.customColors.glow || '245, 158, 11'
      };
    }
    return VideoGenerator.THEMES[this.theme] || VideoGenerator.THEMES.sunset;
  }

  setSongMeta(meta, durationOverride = 0) {
    this.songMeta = meta;
    const rawLyrics = this.customLyricsText ?? meta?.customLyrics ?? meta?.prompt ?? '';
    this.setCustomLyrics(rawLyrics, durationOverride || meta?.duration || 180, this.lyricTiming || meta?.lyricTiming);
  }

  setCustomLyrics(rawLyrics, durationOverride = 0, timing = this.lyricTiming) {
    this.customLyricsText = String(rawLyrics ?? '');
    const dur = durationOverride || this.songMeta?.duration || 180;
    this.lyricTiming = null;
    if (timing?.sourceText === this.customLyricsText && Math.abs(timing.duration - dur) < 0.25) {
      try {
        LyricAlignment.validateCues(timing.cues, dur, this.customLyricsText);
        this.lyricTiming = timing;
        this.lyricCues = timing.cues;
        return;
      } catch { /* Imported or stale timing must not override valid editable lyrics. */ }
    }
    this.lyricCues = LyricsUtils.getTimedCues(this.customLyricsText, dur);
  }

  setResolution(res) {
    this.resolution = res || '1080p';
    if (!this.bitrateManuallySet) {
      if (this.resolution === '720p') this.bitrateMbps = 6;
      else if (this.resolution === '480p') this.bitrateMbps = 3;
      else this.bitrateMbps = 12;
    }
    this.updateCanvasDimensions();
  }

  updateCanvasDimensions() {
    if (!this.canvas) return;
    const res = this.resolution || '1080p';

    if (res === '720p') {
      if (this.aspectRatio === '16:9') {
        this.canvas.width = 1280;
        this.canvas.height = 720;
      } else if (this.aspectRatio === '9:16') {
        this.canvas.width = 720;
        this.canvas.height = 1280;
      } else {
        this.canvas.width = 720;
        this.canvas.height = 720;
      }
    } else if (res === '480p') {
      if (this.aspectRatio === '16:9') {
        this.canvas.width = 854;
        this.canvas.height = 480;
      } else if (this.aspectRatio === '9:16') {
        this.canvas.width = 480;
        this.canvas.height = 854;
      } else {
        this.canvas.width = 480;
        this.canvas.height = 480;
      }
    } else {
      // 1080p Full HD default
      if (this.aspectRatio === '16:9') {
        this.canvas.width = 1920;
        this.canvas.height = 1080;
      } else if (this.aspectRatio === '9:16') {
        this.canvas.width = 1080;
        this.canvas.height = 1920;
      } else {
        this.canvas.width = 1080;
        this.canvas.height = 1080;
      }
    }
  }

  async loadCoverImage(url) {
    return new Promise((resolve) => {
      if (!url) {
        this.coverImage = this._makePlaceholderImage();
        resolve(this.coverImage);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.coverImage = img;
        resolve(img);
      };
      img.onerror = () => {
        this.coverImage = this._makePlaceholderImage();
        resolve(this.coverImage);
      };
      img.src = url;
    });
  }

  async loadCustomCover(urlOrBase64) {
    return new Promise((resolve) => {
      if (!urlOrBase64) {
        this.customCoverImage = null;
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.customCoverImage = img;
        resolve(img);
      };
      img.onerror = () => {
        this.customCoverImage = null;
        resolve(null);
      };
      img.src = urlOrBase64;
    });
  }

  setCustomCover(dataUrl) {
    this.customCoverDataUrl = dataUrl;
    if (dataUrl) {
      return this.loadCustomCover(dataUrl);
    } else {
      this.customCoverImage = null;
      return Promise.resolve(null);
    }
  }

  async loadBackgroundImage(urlOrBase64) {
    return new Promise((resolve) => {
      if (!urlOrBase64) {
        this.backgroundImage = null;
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.backgroundImage = img;
        resolve(img);
      };
      img.onerror = () => {
        this.backgroundImage = null;
        resolve(null);
      };
      img.src = urlOrBase64;
    });
  }

  setCustomBackground(dataUrl) {
    this.customBgDataUrl = dataUrl;
    if (dataUrl) {
      return this.loadBackgroundImage(dataUrl);
    } else {
      this.backgroundImage = null;
      return Promise.resolve(null);
    }
  }

  _makePlaceholderImage() {
    const placeholder = document.createElement('canvas');
    placeholder.width = 500;
    placeholder.height = 500;
    const pctx = placeholder.getContext('2d');
    const pal = this.getActivePalette();
    const grad = pctx.createLinearGradient(0, 0, 500, 500);
    grad.addColorStop(0, pal.primary);
    grad.addColorStop(1, pal.secondary);
    pctx.fillStyle = grad;
    pctx.fillRect(0, 0, 500, 500);
    pctx.fillStyle = '#0a0c13';
    pctx.font = 'bold 140px Inter, sans-serif';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillText('♪', 250, 250);

    const fallbackImg = new Image();
    fallbackImg.src = placeholder.toDataURL();
    return fallbackImg;
  }

  _wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 2);
  }

  /**
   * Generates a 2D clipping and border path for any card geometry
   */
  _createCardPath(ctx, cx, cy, size, shape) {
    ctx.beginPath();
    const half = size / 2;
    const x = cx - half;
    const y = cy - half;

    if (shape === 'circle') {
      ctx.arc(cx, cy, half, 0, Math.PI * 2);
    } else if (shape === 'stadium') {
      ctx.roundRect(x, y, size, size, half);
    } else if (shape === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + half * Math.cos(a);
        const py = cy + half * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (shape === 'diamond') {
      ctx.moveTo(cx, y);
      ctx.lineTo(x + size, cy);
      ctx.lineTo(cx, y + size);
      ctx.lineTo(x, cy);
      ctx.closePath();
    } else if (shape === 'chamfer') {
      const c = size * 0.15;
      ctx.moveTo(x + c, y);
      ctx.lineTo(x + size - c, y);
      ctx.lineTo(x + size, y + c);
      ctx.lineTo(x + size, y + size - c);
      ctx.lineTo(x + size - c, y + size);
      ctx.lineTo(x + c, y + size);
      ctx.lineTo(x, y + size - c);
      ctx.lineTo(x, y + c);
      ctx.closePath();
    } else {
      const radius = typeof shape === 'number' ? Math.max(0, shape) : (Number(shape) || 0);
      ctx.roundRect(x, y, size, size, radius);
    }
  }

  /**
   * Calculates the exact perimeter contact point and outward normal vector
   * for any artwork card shape geometry at a given radial angle.
   * Enables the radial visualizer to inherit the exact shape of the card (square, squircle, hex, chamfer, stadium, etc.).
   */
  _getCardBoundaryPointAndNormal(cx, cy, size, shape, angle, pad = 6) {
    const H = size / 2 + pad;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sgnX = cos >= 0 ? 1 : -1;
    const sgnY = sin >= 0 ? 1 : -1;
    const absDx = Math.abs(cos);
    const absDy = Math.abs(sin);

    if (shape === 'circle') {
      return { x0: cx + H * cos, y0: cy + H * sin, nx: cos, ny: sin };
    }

    let r = 0;
    if (shape === 'stadium') {
      r = H;
    } else if (shape === 'diamond') {
      const t = H / (absDx + absDy || 0.0001);
      return {
        x0: cx + sgnX * t * absDx,
        y0: cy + sgnY * t * absDy,
        nx: sgnX * 0.7071,
        ny: sgnY * 0.7071
      };
    } else if (shape === 'chamfer') {
      const c = size * 0.15 + pad * 0.5;
      const diagConst = 2 * H - c;
      const phi = Math.atan2(absDy, absDx);
      const phi1 = Math.atan2(H - c, H);
      const phi2 = Math.atan2(H, H - c);
      let X, Y, nX, nY;
      if (phi < phi1) {
        X = H;
        Y = H * (absDy / (absDx || 0.0001));
        nX = 1;
        nY = 0;
      } else if (phi > phi2) {
        Y = H;
        X = H * (absDx / (absDy || 0.0001));
        nX = 0;
        nY = 1;
      } else {
        const t = diagConst / (absDx + absDy || 0.0001);
        X = t * absDx;
        Y = t * absDy;
        nX = 0.7071;
        nY = 0.7071;
      }
      return {
        x0: cx + sgnX * X,
        y0: cy + sgnY * Y,
        nx: sgnX * nX,
        ny: sgnY * nY
      };
    } else if (shape === 'hex') {
      const sector = Math.PI / 3;
      const faceAngle = Math.round(angle / sector) * sector;
      const delta = angle - faceAngle;
      const A = H * Math.cos(Math.PI / 6);
      const dist = A / (Math.cos(delta) || 0.0001);
      return {
        x0: cx + dist * cos,
        y0: cy + dist * sin,
        nx: Math.cos(faceAngle),
        ny: Math.sin(faceAngle)
      };
    } else {
      r = Math.min(H, Math.max(0, (typeof shape === 'number' ? shape : Number(shape) || 0) + pad * 0.5));
    }

    if (r <= 0.5) {
      let X, Y, nX, nY;
      if (absDx >= absDy) {
        X = H;
        Y = H * (absDy / (absDx || 0.0001));
        nX = 1;
        nY = 0;
      } else {
        Y = H;
        X = H * (absDx / (absDy || 0.0001));
        nX = 0;
        nY = 1;
      }
      return {
        x0: cx + sgnX * X,
        y0: cy + sgnY * Y,
        nx: sgnX * nX,
        ny: sgnY * nY
      };
    }

    const C0 = H - r;
    const phi = Math.atan2(absDy, absDx);
    const phi1 = Math.atan2(C0, H);
    const phi2 = Math.atan2(H, C0);
    let X, Y, nX, nY;
    if (phi <= phi1) {
      X = H;
      Y = H * (absDy / (absDx || 0.0001));
      nX = 1;
      nY = 0;
    } else if (phi >= phi2) {
      Y = H;
      X = H * (absDx / (absDy || 0.0001));
      nX = 0;
      nY = 1;
    } else {
      const sin2Phi = 2 * absDx * absDy;
      const disc = r * r - C0 * C0 * (1 - sin2Phi);
      const t = C0 * (absDx + absDy) + Math.sqrt(Math.max(0, disc));
      X = t * absDx;
      Y = t * absDy;
      nX = (X - C0) / r;
      nY = (Y - C0) / r;
      const len = Math.hypot(nX, nY) || 1;
      nX /= len;
      nY /= len;
    }
    return {
      x0: cx + sgnX * X,
      y0: cy + sgnY * Y,
      nx: sgnX * nX,
      ny: sgnY * nY
    };
  }

  /**
   * Draws a single 1080p frame onto the canvas
   */
  drawFrame(freqData, currentTime = 0, totalDuration = 0) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const pal = this.getActivePalette();
    const isVertical = this.aspectRatio === '9:16';
    const isLandscape = this.aspectRatio === '16:9';

    ctx.clearRect(0, 0, w, h);

    // Compute audio bass energy (0..1) with user-tuned sensitivity gain
    let energy = 0;
    const gain = typeof this.vizSensitivity === 'number' ? this.vizSensitivity : 1.0;
    if (freqData && freqData.length > 0) {
      let sum = 0;
      const count = Math.min(16, freqData.length);
      for (let i = 0; i < count; i++) sum += freqData[i];
      energy = Math.min(1.0, (sum / count / 255) * gain);
    }

    // 1. Deep Obsidian Base
    ctx.fillStyle = '#06080d';
    ctx.fillRect(0, 0, w, h);

    // 2. Cinema Background (Custom Image, Ambient Artwork, or Multi-Slide Deck)
    const activeCover = this.customCoverImage || this.coverImage;
    let activeBgImg = this.backgroundImage || activeCover;
    let nextBgImg = null;
    let isTransitioning = false;
    let transitionProgress = 0; // 0.0 .. 1.0
    let currentSlideIdx = 0;
    let slideProgress = totalDuration > 0 ? (currentTime / totalDuration) : 0;
    const isSlideDeck = (this.slides && this.slides.length > 0);

    // Multi-Slide Deck: Smooth transitions and fluid camera motion between sequential photos
    if (isSlideDeck) {
      const N = this.slides.length;
      if (N === 1) {
        activeBgImg = this.slides[0].img || activeBgImg;
        slideProgress = totalDuration > 0 ? (currentTime / totalDuration) : 0;
      } else {
        const slideDur = (this.slideDurationSec && this.slideDurationSec > 0)
          ? this.slideDurationSec
          : (totalDuration > 0 ? totalDuration / N : 10);
        currentSlideIdx = Math.min(N - 1, Math.max(0, Math.floor(currentTime / slideDur)));
        const slideLocalTime = currentTime - currentSlideIdx * slideDur;
        slideProgress = Math.min(1.0, Math.max(0.0, slideLocalTime / slideDur));

        activeBgImg = this.slides[currentSlideIdx].img || activeBgImg;

        // Transition window: user-configurable transition duration (default 1.2s or max 45% of slide time)
        const transSec = Math.max(0.2, Math.min(slideDur * 0.45, this.slideTransitionSec || 1.2));
        const transWindow = transSec / slideDur;
        if (slideProgress > (1.0 - transWindow) && currentSlideIdx < N - 1) {
          nextBgImg = this.slides[currentSlideIdx + 1].img;
          transitionProgress = Math.min(1.0, Math.max(0.0, (slideProgress - (1.0 - transWindow)) / transWindow));
          isTransitioning = true;
        }
      }
    }

    if (activeBgImg) {
      // 15 Cinematic Camera Motions
      const getMotionParams = (prog, idx) => {
        let scale = 1.0;
        let offsetX = 0;
        let offsetY = 0;
        let angle = 0;

        switch (this.bgMotion) {
          case 'ken-burns-dynamic': {
            // Auto-alternating cinematic motion per slide index
            const mode = Math.abs(idx) % 4;
            if (mode === 0) {
              // Smooth Zoom In + Gentle Pan Right
              scale = (1.06 + prog * 0.14) * (1.0 + energy * 0.02);
              offsetX = (-0.02 + prog * 0.04) * w;
              offsetY = Math.sin(prog * Math.PI) * h * 0.015;
            } else if (mode === 1) {
              // Dramatic Zoom Out + Gentle Pan Left
              scale = (1.20 - prog * 0.14) * (1.0 + energy * 0.02);
              offsetX = (0.02 - prog * 0.04) * w;
              offsetY = -Math.sin(prog * Math.PI) * h * 0.015;
            } else if (mode === 2) {
              // Upward Crane Glide
              scale = 1.14 * (1.0 + energy * 0.02);
              offsetX = Math.sin(prog * Math.PI) * w * 0.015;
              offsetY = (0.03 - prog * 0.06) * h;
            } else {
              // Dutch Tilt & Diagonal Drift
              scale = (1.10 + prog * 0.08) * (1.0 + energy * 0.02);
              angle = (-0.025 + prog * 0.05);
              offsetX = (-0.025 + prog * 0.05) * w;
              offsetY = (-0.015 + prog * 0.03) * h;
            }
            break;
          }
          case 'ken-burns': {
            const drift = 1.05 + prog * 0.14;
            scale = drift * (1.0 + energy * 0.02);
            offsetX = Math.sin(prog * Math.PI) * w * 0.03;
            offsetY = Math.cos(prog * Math.PI) * h * 0.018;
            break;
          }
          case 'zoom_out': {
            const drift = 1.22 - prog * 0.15;
            scale = drift * (1.0 + energy * 0.02);
            offsetX = -Math.sin(prog * Math.PI) * w * 0.025;
            offsetY = Math.sin(prog * Math.PI) * h * 0.015;
            break;
          }
          case 'pan_left_to_right': {
            scale = 1.15 * (1.0 + energy * 0.015);
            offsetX = (-0.04 + prog * 0.08) * w;
            offsetY = Math.sin(prog * Math.PI) * h * 0.01;
            break;
          }
          case 'pan_right_to_left': {
            scale = 1.15 * (1.0 + energy * 0.015);
            offsetX = (0.04 - prog * 0.08) * w;
            offsetY = Math.sin(prog * Math.PI) * h * 0.01;
            break;
          }
          case 'pan_up_to_down': {
            scale = 1.15 * (1.0 + energy * 0.015);
            offsetX = Math.sin(prog * Math.PI) * w * 0.01;
            offsetY = (-0.04 + prog * 0.08) * h;
            break;
          }
          case 'pan_down_to_up': {
            scale = 1.15 * (1.0 + energy * 0.015);
            offsetX = Math.sin(prog * Math.PI) * w * 0.01;
            offsetY = (0.04 - prog * 0.08) * h;
            break;
          }
          case 'pan_drift': {
            scale = 1.15 * (1.0 + energy * 0.015);
            offsetX = Math.sin(currentTime * 0.25) * w * 0.04;
            offsetY = Math.cos(currentTime * 0.18) * h * 0.02;
            break;
          }
          case 'handheld': {
            scale = 1.08;
            offsetX = (Math.sin(currentTime * 0.8) * 0.012 + Math.sin(currentTime * 1.9) * 0.006) * w;
            offsetY = (Math.cos(currentTime * 0.6) * 0.012 + Math.cos(currentTime * 1.7) * 0.006) * h;
            angle = Math.sin(currentTime * 0.7) * 0.006;
            break;
          }
          case 'dutch_angle': {
            scale = 1.14 * (1.0 + energy * 0.02);
            angle = (-0.028 + prog * 0.056);
            offsetX = Math.sin(prog * Math.PI) * w * 0.02;
            break;
          }
          case 'slow_shimmer': {
            scale = (1.08 + Math.sin(currentTime * 0.6) * 0.04) * (1.0 + energy * 0.015);
            offsetX = Math.sin(currentTime * 0.3) * w * 0.025;
            offsetY = Math.cos(currentTime * 0.22) * h * 0.02;
            break;
          }
          case 'pulse': {
            scale = 1.0 + energy * 0.065;
            break;
          }
          case 'hyperspace': {
            scale = 1.12 + Math.sin(currentTime * 0.45) * 0.035 + energy * 0.03;
            angle = Math.sin(currentTime * 0.35) * 0.02;
            offsetX = Math.sin(currentTime * 0.6) * w * 0.02;
            break;
          }
          case 'heartbeat': {
            const beatCycle = (currentTime * 2.2) % 1.0;
            const pump1 = Math.exp(-beatCycle * 18) * 0.045;
            const pump2 = (beatCycle > 0.22) ? Math.exp(-(beatCycle - 0.22) * 18) * 0.03 : 0;
            scale = 1.04 + pump1 + pump2 + energy * 0.025;
            break;
          }
          case 'static':
          default: {
            scale = 1.0;
            break;
          }
        }
        return { scale, offsetX, offsetY, angle };
      };

      const drawCinemaImage = (imgToDraw, motion, extraOpts = {}) => {
        if (!imgToDraw) return;
        ctx.save();
        if (extraOpts.opacity !== undefined) ctx.globalAlpha = extraOpts.opacity;

        // RHYTHM-FOLLOWING AUDIO REACTIVITY:
        // Slideshow images pulse and breathe to the rhythm even during transitions!
        const beatBounce = 1.0 + energy * 0.055;
        const rhythmShake = (energy > 0.45) ? (Math.sin(currentTime * 32) * energy * 3.5) : 0;
        const scale = (motion.scale || 1.0) * (extraOpts.extraScale !== undefined ? extraOpts.extraScale : 1.0) * beatBounce;
        const offsetX = (motion.offsetX || 0) + (extraOpts.extraX || 0) + rhythmShake;
        const offsetY = (motion.offsetY || 0) + (extraOpts.extraY || 0);
        const angle = (motion.angle || 0) + (extraOpts.extraAngle || 0);

        const blurPx = (this.bgBlurPx || 0) + (extraOpts.extraBlur || 0);
        if (blurPx > 0) {
          ctx.filter = `blur(${blurPx}px)`;
        }

        const imgRatio = (imgToDraw.naturalWidth || imgToDraw.width || 1) / (imgToDraw.naturalHeight || imgToDraw.height || 1);
        const canvasRatio = w / h;
        let drawW, drawH;
        if (canvasRatio > imgRatio) {
          drawW = w * scale;
          drawH = (w / imgRatio) * scale;
        } else {
          drawH = h * scale;
          drawW = (h * imgRatio) * scale;
        }

        ctx.translate(w / 2 + offsetX, h / 2 + offsetY);
        if (angle) ctx.rotate(angle);
        ctx.drawImage(imgToDraw, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      };

      const progA = isSlideDeck ? slideProgress : (totalDuration > 0 ? (currentTime / totalDuration) : 0);
      const motionA = getMotionParams(progA, currentSlideIdx);

      if (!isTransitioning || !nextBgImg) {
        drawCinemaImage(activeBgImg, motionA, { opacity: 1.0 });
      } else {
        // 12 Cinematic Slideshow Transitions
        const t = transitionProgress; // 0.0 .. 1.0
        const tEase = t * t * (3 - 2 * t); // smoothstep curve
        const transType = this.slideTransition || 'crossfade';
        const motionB = getMotionParams(0.0, currentSlideIdx + 1);

        switch (transType) {
          case 'film_burn': {
            // Golden Film Burn light leak bloom
            drawCinemaImage(activeBgImg, motionA, { opacity: 1.0 });
            drawCinemaImage(nextBgImg, motionB, { opacity: tEase });

            const peak = Math.sin(t * Math.PI);
            if (peak > 0.01) {
              ctx.save();
              ctx.globalCompositeOperation = 'screen';
              const flareX = w * (0.3 + 0.4 * t);
              const flareY = h * 0.45;
              const flareRadius = Math.max(w, h) * (0.4 + peak * 0.5);
              const flareGrad = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, flareRadius);
              flareGrad.addColorStop(0, `rgba(255, 240, 200, ${peak * 0.85})`);
              flareGrad.addColorStop(0.35, `rgba(255, 140, 30, ${peak * 0.70})`);
              flareGrad.addColorStop(0.7, `rgba(230, 40, 10, ${peak * 0.45})`);
              flareGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = flareGrad;
              ctx.fillRect(0, 0, w, h);
              ctx.restore();
            }
            break;
          }
          case 'slide_left': {
            // Push transition left
            drawCinemaImage(activeBgImg, motionA, { extraX: -w * tEase, opacity: 1.0 });
            drawCinemaImage(nextBgImg, motionB, { extraX: w * (1.0 - tEase), opacity: 1.0 });
            break;
          }
          case 'slide_right': {
            // Push transition right
            drawCinemaImage(activeBgImg, motionA, { extraX: w * tEase, opacity: 1.0 });
            drawCinemaImage(nextBgImg, motionB, { extraX: -w * (1.0 - tEase), opacity: 1.0 });
            break;
          }
          case 'slide_up': {
            // Push transition up
            drawCinemaImage(activeBgImg, motionA, { extraY: -h * tEase, opacity: 1.0 });
            drawCinemaImage(nextBgImg, motionB, { extraY: h * (1.0 - tEase), opacity: 1.0 });
            break;
          }
          case 'zoom_in': {
            // A zooms huge into camera, B zooms from 1.2 to 1.0
            drawCinemaImage(activeBgImg, motionA, { extraScale: 1.0 + tEase * 0.9, opacity: Math.max(0, 1.0 - tEase * 1.2) });
            drawCinemaImage(nextBgImg, motionB, { extraScale: 1.2 - tEase * 0.2, opacity: tEase });
            break;
          }
          case 'zoom_out': {
            // A shrinks down, B reveals from 1.25 down to 1.0
            drawCinemaImage(activeBgImg, motionA, { extraScale: Math.max(0.7, 1.0 - tEase * 0.3), opacity: Math.max(0, 1.0 - tEase * 1.2) });
            drawCinemaImage(nextBgImg, motionB, { extraScale: 1.25 - tEase * 0.25, opacity: tEase });
            break;
          }
          case 'blur_dissolve': {
            // Dreamy Gaussian blur melt
            const blurA = t < 0.5 ? t * 40 : (1.0 - t) * 40;
            drawCinemaImage(activeBgImg, motionA, { extraBlur: blurA, opacity: Math.max(0, 1.0 - tEase) });
            drawCinemaImage(nextBgImg, motionB, { extraBlur: blurA, opacity: tEase });
            break;
          }
          case 'circle_wipe': {
            // Iris circle wipe expansion
            drawCinemaImage(activeBgImg, motionA, { opacity: 1.0 });
            ctx.save();
            ctx.beginPath();
            const maxRadius = Math.hypot(w, h) * 0.65;
            ctx.arc(w / 2, h / 2, maxRadius * tEase, 0, Math.PI * 2);
            ctx.clip();
            drawCinemaImage(nextBgImg, motionB, { opacity: 1.0 });
            ctx.restore();
            if (t > 0.05 && t < 0.95) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(w / 2, h / 2, maxRadius * tEase, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(255, 255, 255, ${Math.sin(t * Math.PI) * 0.6})`;
              ctx.lineWidth = 4;
              ctx.stroke();
              ctx.restore();
            }
            break;
          }
          case 'shutter_split': {
            // Venetian shutter split reveal
            drawCinemaImage(activeBgImg, motionA, { opacity: 1.0 });
            const shutters = 8;
            const shutterH = h / shutters;
            ctx.save();
            ctx.beginPath();
            for (let s = 0; s < shutters; s++) {
              ctx.rect(0, s * shutterH, w, shutterH * tEase);
            }
            ctx.clip();
            drawCinemaImage(nextBgImg, motionB, { opacity: 1.0 });
            ctx.restore();
            break;
          }
          case 'fade_black': {
            // Film Noir dip to black
            if (t < 0.5) {
              const alphaA = 1.0 - t * 2;
              drawCinemaImage(activeBgImg, motionA, { opacity: alphaA });
            } else {
              const alphaB = (t - 0.5) * 2;
              drawCinemaImage(nextBgImg, motionB, { opacity: alphaB });
            }
            break;
          }
          case 'glitch_slice': {
            // Cyber Glitch slice displacement
            drawCinemaImage(activeBgImg, motionA, { opacity: 1.0 - tEase });
            const slices = 10;
            const sliceH = h / slices;
            ctx.save();
            for (let i = 0; i < slices; i++) {
              const sliceOffset = Math.sin(i * 3.7 + t * 10) * w * 0.08 * Math.sin(t * Math.PI);
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, i * sliceH, w, sliceH);
              ctx.clip();
              drawCinemaImage(nextBgImg, motionB, { extraX: sliceOffset, opacity: tEase });
              ctx.restore();
            }
            ctx.restore();
            break;
          }
          case 'heart_wipe': {
            // Romantic Expanding Heart Wipe Mask
            drawCinemaImage(activeBgImg, motionA, { opacity: 1.0 });
            ctx.save();
            ctx.beginPath();
            const heartScale = Math.hypot(w, h) * 0.95 * tEase * (1 + energy * 0.1);
            const hx = w / 2;
            const hy = h / 2 - heartScale * 0.15;
            ctx.translate(hx, hy);

            // Parametric romantic heart shape
            const topH = heartScale * 0.35;
            ctx.moveTo(0, topH);
            ctx.bezierCurveTo(-heartScale / 2, -heartScale / 2, -heartScale, topH / 2, 0, heartScale);
            ctx.bezierCurveTo(heartScale, topH / 2, heartScale / 2, -heartScale / 2, 0, topH);
            ctx.closePath();
            ctx.clip();
            ctx.translate(-hx, -hy);

            drawCinemaImage(nextBgImg, motionB, { opacity: 1.0 });
            ctx.restore();

            // Glowing pink/ruby heart border edge that pulses with rhythm
            if (t > 0.04 && t < 0.96) {
              ctx.save();
              ctx.translate(hx, hy);
              ctx.beginPath();
              ctx.moveTo(0, topH);
              ctx.bezierCurveTo(-heartScale / 2, -heartScale / 2, -heartScale, topH / 2, 0, heartScale);
              ctx.bezierCurveTo(heartScale, topH / 2, heartScale / 2, -heartScale / 2, 0, topH);
              ctx.closePath();
              ctx.strokeStyle = `rgba(244, 63, 94, ${Math.sin(t * Math.PI) * 0.9})`;
              ctx.shadowColor = '#f43f5e';
              ctx.shadowBlur = 18 + energy * 18;
              ctx.lineWidth = 5 + energy * 4;
              ctx.stroke();
              ctx.restore();
            }
            break;
          }
          case 'love_bloom': {
            // Romantic Pastel Pink Light Leak Bloom & Heart Flare
            drawCinemaImage(activeBgImg, motionA, { opacity: 1.0 });
            drawCinemaImage(nextBgImg, motionB, { opacity: tEase });

            const peak = Math.sin(t * Math.PI);
            if (peak > 0.01) {
              ctx.save();
              ctx.globalCompositeOperation = 'screen';
              const flareRadius = Math.max(w, h) * (0.45 + peak * 0.6 + energy * 0.15);
              const flareGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, flareRadius);
              flareGrad.addColorStop(0, `rgba(255, 230, 240, ${peak * 0.95})`);
              flareGrad.addColorStop(0.35, `rgba(244, 63, 94, ${peak * 0.75})`);
              flareGrad.addColorStop(0.7, `rgba(236, 72, 153, ${peak * 0.45})`);
              flareGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = flareGrad;
              ctx.fillRect(0, 0, w, h);
              ctx.restore();
            }
            break;
          }
          case 'petal_dissolve': {
            // Soft blur melt with swirling rose petals across the transition seam
            drawCinemaImage(activeBgImg, motionA, { extraBlur: tEase * 18, opacity: Math.max(0, 1.0 - tEase) });
            drawCinemaImage(nextBgImg, motionB, { extraBlur: (1.0 - tEase) * 18, opacity: tEase });

            const numPetals = 16;
            ctx.save();
            for (let p = 0; p < numPetals; p++) {
              const px = (w * (p / numPetals) + Math.sin(t * 8 + p) * 120 + currentTime * 60) % w;
              const py = (h * t + Math.cos(p * 2) * 160) % h;
              const pSize = 14 + (p % 8) * 3;
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(t * 6 + p);
              ctx.globalAlpha = Math.sin(t * Math.PI) * 0.85;
              ctx.fillStyle = p % 2 === 0 ? '#f43f5e' : '#be123c';
              ctx.beginPath();
              ctx.ellipse(0, 0, pSize, pSize * 0.55, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
            ctx.restore();
            break;
          }
          case 'crossfade':
          default: {
            drawCinemaImage(activeBgImg, motionA, { opacity: 1.0 });
            drawCinemaImage(nextBgImg, motionB, { opacity: tEase });
            break;
          }
        }
      }
    }

    // 3. Dimming Scrim Layer & Cinematic Vignette
    if (this.bgDimOpacity > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(5, 7, 12, ${this.bgDimOpacity})`;
      ctx.fillRect(0, 0, w, h);

      // Radial Vignette
      const vigGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.85);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Layout Anchors (Symmetrical Balance vs. Cinema Split View)
    const hasLyricsActive = this.showLyrics && this.lyricCues && this.lyricCues.length > 0;
    const isSplit = isLandscape && this.vizPosition === 'split_side';
    let cx = isSplit ? w * 0.30 : w / 2;
    let cy = isVertical
      ? h * 0.31
      : (isLandscape
          ? (isSplit ? h * 0.50 : (hasLyricsActive ? h * 0.28 : h * 0.36))
          : h * 0.36);

    if (this.customPositions && this.customPositions.artwork) {
      cx = this.customPositions.artwork.x * w;
      cy = this.customPositions.artwork.y * h;
    }

    const baseCoverSize = Math.min(w, h) * (isVertical ? this.artSizeScale * 1.15 : (isLandscape && !isSplit ? (hasLyricsActive ? this.artSizeScale * 0.72 : this.artSizeScale * 0.88) : this.artSizeScale));
    const currentCoverSize = baseCoverSize * (1 + energy * 0.035);

    // 4. Multi-Engine Audio-Reactive Particle Field
    if (this.showParticles) {
      this._drawParticleField(ctx, w, h, pal, energy, currentTime, cx, cy, currentCoverSize, isVertical, isLandscape);
    }

    if (this.artMode !== 'none') {
      this.lastComponentBoxes.artwork = {
        id: 'artwork',
        name: this.artMode === 'vinyl' ? 'Vinyl Turntable' : 'Album Artwork',
        x: cx - currentCoverSize / 2,
        y: cy - currentCoverSize / 2,
        w: currentCoverSize,
        h: currentCoverSize,
        cx,
        cy
      };
    } else {
      this.lastComponentBoxes.artwork = null;
    }

    // 5. Artwork Presentation: Glass Card vs. Spinning Vinyl Record
    if (this.artMode === 'vinyl') {
      // --- SPINNING VINYL RECORD DISC ---
      ctx.save();
      const vinylRadius = currentCoverSize * 0.56;
      const spinAngle = currentTime * 2.2; // Continuous turntable rotation

      // Vinyl Drop Shadow
      ctx.shadowColor = `rgba(${pal.glow}, ${0.35 + energy * 0.45})`;
      ctx.shadowBlur = 32 + energy * 24;
      ctx.shadowOffsetY = 12;

      // Base Vinyl Disc
      ctx.beginPath();
      ctx.arc(cx, cy, vinylRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0c11';
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // Concentric Vinyl Grooves
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spinAngle);

      for (let r = vinylRadius * 0.48; r < vinylRadius * 0.98; r += 4) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = (Math.round(r) % 8 === 0) ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.025)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Vinyl Specular Sheen (2 opposite lighting wedges)
      const sheenGrad = ctx.createLinearGradient(-vinylRadius, -vinylRadius, vinylRadius, vinylRadius);
      sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
      sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
      ctx.fillStyle = sheenGrad;
      ctx.beginPath();
      ctx.arc(0, 0, vinylRadius, 0, Math.PI * 2);
      ctx.fill();

      // Center Album Label
      const labelRadius = vinylRadius * 0.44;
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
      ctx.clip();

      if (activeCover && activeCover !== this.coverImage) {
        // User uploaded custom artwork / label
        ctx.drawImage(activeCover, -labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
      } else if (this.coverImage && this.songMeta && this.songMeta.imageLarge) {
        // Online song artwork
        ctx.drawImage(this.coverImage, -labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
      } else {
        // Authentic Vinyl Record Label Print (Classy Retro Disc)
        const lGrad = ctx.createLinearGradient(-labelRadius, -labelRadius, labelRadius, labelRadius);
        lGrad.addColorStop(0, pal.primary);
        lGrad.addColorStop(1, pal.secondary);
        ctx.fillStyle = lGrad;
        ctx.fillRect(-labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);

        ctx.fillStyle = '#0a0d14';
        ctx.font = `bold ${Math.floor(labelRadius * 0.22)}px "${this.fontFamily}", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelText = (this.songMeta && this.songMeta.title) ? this.songMeta.title.slice(0, 16) : 'NTK HUB';
        ctx.fillText(labelText, 0, -labelRadius * 0.30);

        ctx.font = `700 ${Math.floor(labelRadius * 0.13)}px "${this.fontFamily}", sans-serif`;
        ctx.fillText('33⅓ RPM • STEREO', 0, labelRadius * 0.35);
      }
      ctx.restore();

      // Label Ring & Spindle Hole
      ctx.beginPath();
      ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.stroke();

      // Metallic Spindle Ring
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#94a3b8';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#06080d';
      ctx.fill();

      ctx.restore(); // Restore spin
      ctx.restore(); // Restore vinyl base
    } else if (this.artMode === 'card') {
      // --- MODERN GLASS ARTWORK CARD ---
      ctx.save();
      ctx.shadowColor = `rgba(${pal.glow}, ${(0.28 + energy * 0.38) * this.artGlowIntensity})`;
      ctx.shadowBlur = (34 + energy * 26) * this.artGlowIntensity;
      ctx.shadowOffsetY = 14;

      this._createCardPath(ctx, cx, cy, currentCoverSize, this.artCornerRadius);
      ctx.fillStyle = '#11141f';
      ctx.fill();

      if (activeCover) {
        ctx.save();
        this._createCardPath(ctx, cx, cy, currentCoverSize, this.artCornerRadius);
        ctx.clip();
        ctx.drawImage(
          activeCover,
          cx - currentCoverSize / 2,
          cy - currentCoverSize / 2,
          currentCoverSize,
          currentCoverSize
        );
        ctx.restore();
      }

      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      this._createCardPath(ctx, cx, cy, currentCoverSize, this.artCornerRadius);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Visualizer Engine
    const isVisualizerEnabled = this.showVisualizer !== false && this.visualStyle !== 'none';

    if (isVisualizerEnabled && freqData && freqData.length > 0) {
      // 6A. Card-Shaped Radial Visualizer (Inherits exact geometry of artwork card or vinyl disc)
      if (this.visualStyle === 'circular' || this.vizPosition === 'around_artwork') {
        let haloCx = cx;
        let haloCy = cy;
        if (this.customPositions && this.customPositions.visualizer) {
          haloCx = this.customPositions.visualizer.x * w;
          haloCy = this.customPositions.visualizer.y * h;
        }

        const cardShape = this.artMode === 'card' ? this.artCornerRadius : 'circle';
        const haloPad = 8;
        const spokes = 80;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(3.5, Math.floor(Math.min(w, h) * 0.0055));

        // Subtle base contour rim conforming to card shape
        ctx.save();
        ctx.strokeStyle = `rgba(${pal.glow}, 0.28)`;
        ctx.lineWidth = 2;
        this._createCardPath(ctx, haloCx, haloCy, currentCoverSize + haloPad * 2, cardShape);
        ctx.stroke();
        ctx.restore();

        const vizGain = typeof this.vizSensitivity === 'number' ? this.vizSensitivity : 1.0;
        if (this.visualStyle === 'wave') {
          // Continuous undulating audio-reactive wave contour conforming to card geometry
          ctx.beginPath();
          let firstPt = null;
          for (let i = 0; i <= spokes; i++) {
            const idx = i % spokes;
            const angle = (idx / spokes) * Math.PI * 2 - Math.PI / 2;
            const mirrorIdx = idx < spokes / 2 ? idx : spokes - idx;
            const bin = Math.floor((mirrorIdx / (spokes / 2)) * (freqData.length * 0.65));
            const amp = Math.min(1.0, ((freqData[bin] || 0) / 255) * vizGain);
            const barLen = 6 + amp * (baseCoverSize * 0.26);

            const pt = this._getCardBoundaryPointAndNormal(
              haloCx,
              haloCy,
              currentCoverSize,
              cardShape,
              angle,
              haloPad
            );
            const px = pt.x0 + pt.nx * barLen;
            const py = pt.y0 + pt.ny * barLen;

            if (i === 0) {
              firstPt = { px, py };
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          if (firstPt) ctx.lineTo(firstPt.px, firstPt.py);
          ctx.closePath();
          ctx.strokeStyle = pal.primary;
          ctx.lineWidth = Math.max(3.5, Math.floor(Math.min(w, h) * 0.0055));
          ctx.stroke();
        } else {
          // Spokes radiating perpendicularly outward from the card contour
          for (let i = 0; i < spokes; i++) {
            const angle = (i / spokes) * Math.PI * 2 - Math.PI / 2;
            const mirrorIdx = i < spokes / 2 ? i : spokes - i;
            const bin = Math.floor((mirrorIdx / (spokes / 2)) * (freqData.length * 0.65));
            const amp = Math.min(1.0, ((freqData[bin] || 0) / 255) * vizGain);
            const barLen = 8 + amp * (baseCoverSize * 0.28);

            const pt = this._getCardBoundaryPointAndNormal(
              haloCx,
              haloCy,
              currentCoverSize,
              cardShape,
              angle,
              haloPad
            );

            const x1 = pt.x0;
            const y1 = pt.y0;
            const x2 = pt.x0 + pt.nx * barLen;
            const y2 = pt.y0 + pt.ny * barLen;

            ctx.strokeStyle = i % 2 === 0 ? pal.primary : pal.secondary;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }
        ctx.restore();

        const maxHaloSpoke = baseCoverSize * 0.28 + 20;
        const totalSpan = (currentCoverSize / 2 + maxHaloSpoke) * 2;
        this.lastComponentBoxes.visualizer = {
          id: 'visualizer',
          name: 'Card-Shaped Radial Visualizer',
          x: haloCx - totalSpan / 2,
          y: haloCy - totalSpan / 2,
          w: totalSpan,
          h: totalSpan,
          cx: haloCx,
          cy: haloCy
        };
      }

      // 6B. Linear Visualizers (bars, wave, mirrored_bars)
      if (this.visualStyle !== 'circular' && this.vizPosition !== 'around_artwork') {
        let vizCenterX = w / 2;
        let vizBaseY = h * 0.65;
        const vizWidth = w * (this.vizWidthPercent || 0.74);
        const maxVizHeight = this.vizMaxHeight || 120;

        if (this.vizPosition === 'split_side' || isSplit) {
          vizCenterX = w * 0.70;
          vizBaseY = isLandscape ? h * 0.80 : h * 0.65;
        } else if (this.vizPosition === 'center_screen') {
          vizCenterX = w / 2;
          vizBaseY = h * 0.50;
        } else if (this.vizPosition === 'bottom_dock') {
          vizCenterX = w / 2;
          vizBaseY = h * 0.94;
        } else { // 'below_artwork'
          vizCenterX = w / 2;
          const cardBottom = cy + currentCoverSize / 2;
          vizBaseY = isVertical
            ? Math.max(h * 0.58, cardBottom + 65)
            : (isLandscape
                ? (hasLyricsActive ? Math.min(h * 0.53, cardBottom + 48) : Math.min(h * 0.66, cardBottom + 55))
                : Math.min(h * 0.72, cardBottom + 55));
        }

        if (this.customPositions && this.customPositions.visualizer) {
          vizCenterX = this.customPositions.visualizer.x * w;
          vizBaseY = this.customPositions.visualizer.y * h;
        }

        const vizBoxH = this.visualStyle === 'mirrored_bars' ? maxVizHeight * 2 : maxVizHeight;
        const vizBoxY = this.visualStyle === 'mirrored_bars' ? vizBaseY - maxVizHeight : vizBaseY - maxVizHeight;
        this.lastComponentBoxes.visualizer = {
          id: 'visualizer',
          name: this.visualStyle === 'wave' ? 'Wave Visualizer' : 'Spectrum Bars',
          x: vizCenterX - vizWidth / 2,
          y: vizBoxY,
          w: vizWidth,
          h: vizBoxH,
          cx: vizCenterX,
          cy: vizBaseY
        };

        ctx.save();
        const startX = vizCenterX - vizWidth / 2;

        if (this.visualStyle === 'wave') {
          const waveGrad = ctx.createLinearGradient(startX, 0, startX + vizWidth, 0);
          waveGrad.addColorStop(0, pal.secondary);
          waveGrad.addColorStop(0.5, pal.primary);
          waveGrad.addColorStop(1, pal.secondary);

          ctx.strokeStyle = waveGrad;
          ctx.lineWidth = 6;
          ctx.shadowColor = pal.primary;
          ctx.shadowBlur = 18;
          ctx.beginPath();

          const points = 64;
          const vizGain = typeof this.vizSensitivity === 'number' ? this.vizSensitivity : 1.0;
          for (let i = 0; i <= points; i++) {
            const bin = Math.min(freqData.length - 1, Math.floor((i / points) * freqData.length * 0.65));
            const amp = Math.min(1.0, ((freqData[bin] || 0) / 255) * vizGain);
            const waveOffset = Math.sin(i * 0.45 + currentTime * 7) * amp * (maxVizHeight * 0.65);
            const px = startX + (i / points) * vizWidth;
            const py = vizBaseY - maxVizHeight * 0.35 + waveOffset;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else if (this.visualStyle === 'mirrored_bars') {
          // Mirrored Dual Bars (Extending both UP and DOWN)
          const numBars = 48;
          const barWidth = vizWidth / numBars;
          const vizGain = typeof this.vizSensitivity === 'number' ? this.vizSensitivity : 1.0;
          const barGrad = ctx.createLinearGradient(0, vizBaseY - maxVizHeight, 0, vizBaseY + maxVizHeight);
          barGrad.addColorStop(0, pal.secondary);
          barGrad.addColorStop(0.5, pal.primary);
          barGrad.addColorStop(1, pal.secondary);
          ctx.fillStyle = barGrad;

          for (let i = 0; i < numBars; i++) {
            const binIndex = Math.floor(Math.pow(i / numBars, 1.35) * (freqData.length * 0.65));
            const val = Math.min(255, (freqData[binIndex] || 0) * vizGain);
            const halfH = Math.max(4, (val / 255) * (maxVizHeight * 0.58));
            const bx = startX + i * barWidth;
            ctx.beginPath();
            ctx.roundRect(bx + 2, vizBaseY - halfH, Math.max(2, barWidth - 4), halfH * 2, 4);
            ctx.fill();
          }
        } else {
          // Standard Spectrum Bars
          const numBars = 52;
          const barWidth = vizWidth / numBars;
          const vizGain = typeof this.vizSensitivity === 'number' ? this.vizSensitivity : 1.0;
          const barGrad = ctx.createLinearGradient(0, vizBaseY - maxVizHeight, 0, vizBaseY);
          barGrad.addColorStop(0, pal.secondary);
          barGrad.addColorStop(0.5, pal.primary);
          barGrad.addColorStop(1, `rgba(${pal.glow}, 0.22)`);
          ctx.fillStyle = barGrad;

          for (let i = 0; i < numBars; i++) {
            const binIndex = Math.floor(Math.pow(i / numBars, 1.35) * (freqData.length * 0.65));
            const val = Math.min(255, (freqData[binIndex] || 0) * vizGain);
            const barH = Math.max(6, (val / 255) * maxVizHeight);
            const bx = startX + i * barWidth;
            const by = vizBaseY - barH;
            ctx.beginPath();
            ctx.roundRect(bx + 2, by, Math.max(2, barWidth - 4), barH, 4);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    // 7. Synchronized Kinetic Karaoke Lyrics
    let textCenterX = isSplit ? w * 0.70 : w / 2;
    const hasCues = this.showLyrics && this.lyricCues && this.lyricCues.length > 0;

    if (hasCues) {
      let activeIdx = -1;
      for (let i = 0; i < this.lyricCues.length; i++) {
        if (currentTime >= this.lyricCues[i].start && currentTime < this.lyricCues[i].end) {
          activeIdx = i;
          break;
        }
      }
      // Show first sung cue when paused at 0:00 so user can inspect style & drag-position lyrics
      if (activeIdx === -1 && !this.isPreviewing && !this.isRecording && currentTime < 0.05 && this.lyricCues.length > 0) {
        activeIdx = 0;
      }

      const activeCue = activeIdx >= 0 ? this.lyricCues[activeIdx] : null;
      const nextCue = (activeIdx >= 0 && activeIdx + 1 < this.lyricCues.length) ? this.lyricCues[activeIdx + 1] : null;

      let lyricBoxY = isVertical ? h * 0.72 : (isLandscape ? (isSplit ? h * 0.48 : h * 0.70) : h * 0.74);
      if (this.lyricPosition === 'center') {
        lyricBoxY = isLandscape && !isSplit ? h * 0.62 : h * 0.50;
      } else if (this.lyricPosition === 'top') {
        lyricBoxY = isVertical ? h * 0.16 : (isLandscape && isSplit ? h * 0.28 : h * 0.16);
      }

      if (this.customPositions && this.customPositions.lyrics) {
        textCenterX = this.customPositions.lyrics.x * w;
        lyricBoxY = this.customPositions.lyrics.y * h;
      }

      const maxTextW = isLandscape ? (isSplit ? w * 0.46 : w * 0.58) : w * 0.80;

      ctx.save();
      const mainFontPx = Math.floor(Math.min(w, h) * (isVertical ? 0.038 : 0.032));
      ctx.font = `800 ${mainFontPx}px "${this.fontFamily}", system-ui, sans-serif`;

      if (activeCue) {
        const wrapped = this._wrapText(ctx, activeCue.text, maxTextW);
        const pillH = wrapped.length * (mainFontPx * 1.34) + (nextCue ? mainFontPx * 1.25 : 24) + 24;
        const pillW = maxTextW + 48;

        this.lastComponentBoxes.lyrics = {
          id: 'lyrics',
          name: 'Kinetic Lyrics',
          x: textCenterX - pillW / 2,
          y: lyricBoxY - 22,
          w: pillW,
          h: pillH,
          cx: textCenterX,
          cy: lyricBoxY + pillH / 2 - 22
        };

        // Container Scrim (Configurable User Toggle & Opacity)
        if (this.lyricScrimEnabled !== false) {
          const scrimAlpha = typeof this.lyricScrimOpacity === 'number' ? this.lyricScrimOpacity : 0.68;
          ctx.fillStyle = `rgba(10, 12, 19, ${scrimAlpha})`;
          ctx.strokeStyle = `rgba(255, 255, 255, ${scrimAlpha * 0.22})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(textCenterX - pillW / 2, lyricBoxY - 22, pillW, pillH, 22);
          ctx.fill();
          if (scrimAlpha > 0.08) ctx.stroke();
        }

        const cueDuration = Math.max(0.4, activeCue.end - activeCue.start);

        // Subtitle Outline Stroke Engine (Guarantees readability over bright backgrounds)
        const strokeW = typeof this.lyricStrokeWidth === 'number' ? this.lyricStrokeWidth : 3;
        const strokeCol = this.lyricStrokeColor || '#000000';
        // Draw locally: never replace the canvas context's fillText method.
        const drawLyricText = (text, x, y, maxW) => {
          if (strokeW > 0 && !['#0a0d14', '#000000', '#0a0c13'].includes(ctx.fillStyle)) {
            ctx.save();
            ctx.lineWidth = strokeW; ctx.strokeStyle = strokeCol;
            ctx.lineJoin = 'round'; ctx.miterLimit = 2;
            if (maxW !== undefined) ctx.strokeText(text, x, y, maxW);
            else ctx.strokeText(text, x, y);
            ctx.restore();
          }
          if (maxW !== undefined) ctx.fillText(text, x, y, maxW);
          else ctx.fillText(text, x, y);
        };
        let cueWordIndex = 0;
        const cueWordCount = activeCue.text.trim().split(/\s+/).length;

        // Render Animated Words Per Line
        wrapped.forEach((lineText, lineIdx) => {
          const words = lineText.split(/\s+/).filter(Boolean);
          if (words.length === 0) return;

          const wordWidths = words.map((wd) => ctx.measureText(wd + ' ').width);
          const lineTotalW = wordWidths.reduce((a, b) => a + b, 0);
          let wordX = textCenterX - lineTotalW / 2;
          const lineY = lyricBoxY + 14 + lineIdx * (mainFontPx * 1.32);

          words.forEach((wd, wIdx) => {
            const wdW = wordWidths[wIdx];
            const globalWordIndex = cueWordIndex++;
            const measuredWord = activeCue.words?.[globalWordIndex];
            const wordStartRatio = globalWordIndex / cueWordCount;
            const wordEndRatio = (globalWordIndex + 1) / cueWordCount;
            const wordStartTime = measuredWord?.start ?? (activeCue.start + wordStartRatio * cueDuration);
            const wordEndTime = measuredWord?.end ?? (activeCue.start + wordEndRatio * cueDuration);

            const isActive = currentTime >= wordStartTime && currentTime < wordEndTime;
            const isPast = currentTime >= wordEndTime;
            const isFuture = currentTime < wordStartTime;
            const wordProgress = isActive ? Math.max(0, Math.min(1, (currentTime - wordStartTime) / Math.max(0.01, wordEndTime - wordStartTime))) : 0;

            ctx.save();

            if (this.lyricAnimation === 'capcut_bounce') {
              // --- 1. CAPCUT BOUNCY POP ---
              if (isActive) {
                const spring = Math.sin(wordProgress * Math.PI) * 0.32;
                const lift = -Math.sin(wordProgress * Math.PI) * 12;
                ctx.translate(wordX + wdW / 2, lineY + lift);
                ctx.scale(1 + spring, 1 + spring);
                ctx.fillStyle = pal.primary;
                ctx.shadowColor = `rgba(${pal.glow}, 0.95)`;
                ctx.shadowBlur = 28;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                drawLyricText(wd, 0, 0);
              } else if (isPast) {
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 0;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                drawLyricText(wd, wordX, lineY);
              } else {
                ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
                ctx.shadowBlur = 0;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                drawLyricText(wd, wordX, lineY);
              }
            } else if (this.lyricAnimation === 'highlighter') {
              // --- 2. VIRAL SHORTS HIGHLIGHT PILL ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              if (isActive) {
                const bounce = Math.sin(wordProgress * Math.PI) * 4;
                ctx.fillStyle = pal.primary;
                ctx.shadowColor = `rgba(${pal.glow}, 0.85)`;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.roundRect(wordX - 4, lineY - mainFontPx * 0.82 - bounce, wdW + 8, mainFontPx * 1.34, 10);
                ctx.fill();

                ctx.fillStyle = '#0a0d14'; // High-contrast black on neon
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY - bounce);
              } else if (isPast) {
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY);
              } else {
                ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY);
              }
            } else if (this.lyricAnimation === 'karaoke_wipe') {
              // --- 3. LIQUID KARAOKE WIPE ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = 'rgba(148, 163, 184, 0.40)';
              drawLyricText(wd, wordX, lineY);

              if (isPast) {
                ctx.fillStyle = pal.primary;
                ctx.shadowColor = `rgba(${pal.glow}, 0.70)`;
                ctx.shadowBlur = 14;
                drawLyricText(wd, wordX, lineY);
              } else if (isActive) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(wordX - 2, lineY - mainFontPx, wdW * wordProgress + 4, mainFontPx * 2);
                ctx.clip();
                ctx.fillStyle = pal.primary;
                ctx.shadowColor = `rgba(${pal.glow}, 0.90)`;
                ctx.shadowBlur = 20;
                drawLyricText(wd, wordX, lineY);
                ctx.restore();
              }
            } else if (this.lyricAnimation === 'floating_wave') {
              // --- 4. KINETIC FLOATING WAVE & SHIMMER ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              const waveLift = Math.sin(currentTime * 4.5 + wIdx * 0.85) * 8;
              const isLit = isActive || Math.sin(currentTime * 3.5 - wIdx * 0.6) > 0.4;
              ctx.fillStyle = isActive ? pal.primary : (isLit ? '#ffffff' : pal.secondary);
              ctx.shadowColor = `rgba(${pal.glow}, ${isActive ? 0.95 : 0.4})`;
              ctx.shadowBlur = isActive ? 24 : 8;
              drawLyricText(wd, wordX, lineY + waveLift);
            } else if (this.lyricAnimation === 'glitch_pulse') {
              // --- 5. CYBERPUNK GLITCH PULSE ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              if (isActive) {
                const shake = (Math.random() - 0.5) * 4 * (1 + energy);
                ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
                drawLyricText(wd, wordX - 3 + shake, lineY);
                ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
                drawLyricText(wd, wordX + 3 + shake, lineY);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = pal.primary;
                ctx.shadowBlur = 18;
                drawLyricText(wd, wordX + shake, lineY);
              } else {
                ctx.fillStyle = isPast ? '#ffffff' : 'rgba(148, 163, 184, 0.45)';
                drawLyricText(wd, wordX, lineY);
              }
            } else if (this.lyricAnimation === 'typewriter') {
              // --- 6. TERMINAL TYPEWRITER & BLINKING CURSOR ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              if (isFuture) {
                // Future words remain unrevealed
              } else if (isActive) {
                const charsToShow = Math.max(1, Math.ceil(wd.length * wordProgress));
                const partial = wd.slice(0, charsToShow);
                ctx.fillStyle = pal.primary;
                ctx.shadowColor = `rgba(${pal.glow}, 0.85)`;
                ctx.shadowBlur = 18;
                drawLyricText(partial, wordX, lineY);

                if (Math.floor(currentTime * 4) % 2 === 0) {
                  const partialWidth = ctx.measureText(partial).width;
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(wordX + partialWidth + 3, lineY - mainFontPx * 0.45, 3.5, mainFontPx * 0.9);
                }
              } else {
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY);
              }
            } else if (this.lyricAnimation === 'zoom_impact') {
              // --- 7. BEAST MODE STOMP (KINETIC SLAM & FLASH) ---
              if (isActive) {
                const slam = Math.max(0, 1 - wordProgress);
                const scale = 1.0 + Math.pow(slam, 2) * 0.90;
                ctx.translate(wordX + wdW / 2, lineY);
                ctx.scale(scale, scale);
                ctx.fillStyle = pal.primary;
                ctx.shadowColor = `rgba(255, 255, 255, ${0.45 + slam * 0.55})`;
                ctx.shadowBlur = 18 + slam * 26;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                drawLyricText(wd, 0, 0);
              } else {
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isPast ? '#ffffff' : 'rgba(148, 163, 184, 0.40)';
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY);
              }
            } else if (this.lyricAnimation === 'neon_flicker') {
              // --- 8. TOKYO NEON SIGN (ELECTRIC TUBE FLICKER) ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              if (isActive) {
                const flicker = (Math.sin(currentTime * 28 + wIdx * 2.3) > -0.25) ? 1.0 : 0.35;
                ctx.lineWidth = 3.5;
                ctx.strokeStyle = pal.secondary;
                ctx.shadowColor = `rgba(${pal.glow}, ${0.95 * flicker})`;
                ctx.shadowBlur = 24 * flicker;
                ctx.strokeText(wd, wordX, lineY);
                ctx.fillStyle = '#ffffff';
                drawLyricText(wd, wordX, lineY);
              } else if (isPast) {
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = `rgba(${pal.glow}, 0.60)`;
                ctx.strokeText(wd, wordX, lineY);
                ctx.fillStyle = '#ffffff';
                drawLyricText(wd, wordX, lineY);
              } else {
                ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
                drawLyricText(wd, wordX, lineY);
              }
            } else if (this.lyricAnimation === 'color_cascade') {
              // --- 9. CHROMATIC COLOR CASCADE ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              if (isActive) {
                const hue = (currentTime * 160 + wIdx * 45) % 360;
                const hop = Math.sin(wordProgress * Math.PI) * 6;
                ctx.fillStyle = `hsl(${hue}, 95%, 68%)`;
                ctx.shadowColor = `hsl(${hue}, 95%, 50%)`;
                ctx.shadowBlur = 22;
                drawLyricText(wd, wordX, lineY - hop);
              } else {
                ctx.fillStyle = isPast ? '#ffffff' : 'rgba(148, 163, 184, 0.40)';
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY);
              }
            } else if (this.lyricAnimation === 'fade_slide_up') {
              // --- 10. CINEMATIC VERTICAL LIFT & GLOW ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              if (isActive) {
                const lift = (1 - Math.min(1, wordProgress * 2.2)) * 14;
                const alpha = Math.min(1, wordProgress * 2.8);
                ctx.fillStyle = pal.primary;
                ctx.shadowColor = `rgba(${pal.glow}, ${0.85 * alpha})`;
                ctx.shadowBlur = 20 * alpha;
                drawLyricText(wd, wordX, lineY + lift);
              } else if (isPast) {
                ctx.fillStyle = '#ffffff';
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY);
              } else {
                ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY);
              }
            } else if (this.lyricAnimation === 'spotlight_scale') {
              // --- 11. FOCUS SPOTLIGHT (DEPTH BLUR) ---
              if (isActive) {
                ctx.translate(wordX + wdW / 2, lineY);
                ctx.scale(1.26, 1.26);
                ctx.fillStyle = pal.primary;
                ctx.shadowColor = `rgba(255, 255, 255, 0.95)`;
                ctx.shadowBlur = 26;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                drawLyricText(wd, 0, 0);
              } else {
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isPast ? 'rgba(255, 255, 255, 0.65)' : 'rgba(148, 163, 184, 0.28)';
                ctx.shadowBlur = 0;
                drawLyricText(wd, wordX, lineY);
              }
            } else {
              // --- 12. CLASSIC BROADCAST LINE ---
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = activeCue.isSection ? pal.primary : '#ffffff';
              ctx.shadowColor = `rgba(${pal.glow}, 0.50)`;
              ctx.shadowBlur = 14;
              drawLyricText(wd, wordX, lineY);
            }

            ctx.restore();
            wordX += wdW;
          });
        });

        // Subtitle / Next Line Preview
        if (nextCue) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const subPx = Math.floor(mainFontPx * 0.72);
          ctx.font = `600 ${subPx}px "${this.fontFamily}", system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
          const nextShort = nextCue.text.length > 56 ? nextCue.text.slice(0, 54) + '...' : nextCue.text;
          drawLyricText(nextShort, textCenterX, lyricBoxY + 18 + wrapped.length * (mainFontPx * 1.32));
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 8. Song Title & Studio Metadata Footer
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let titleX = isSplit ? w * 0.70 : w / 2;
    let titleY = isVertical
      ? h * 0.89
      : (isSplit ? h * 0.18 : (hasCues && this.lyricPosition === 'lower-third' ? h * 0.91 : h * 0.89));

    if (this.customPositions && this.customPositions.title) {
      titleX = this.customPositions.title.x * w;
      titleY = this.customPositions.title.y * h;
    }

    const titleFontPx = Math.floor(Math.min(w, h) * 0.036);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${titleFontPx}px "${this.fontFamily}", system-ui, sans-serif`;
    const displayTitle = (this.songMeta && this.songMeta.title) ? this.songMeta.title : 'Suno AI Song';
    ctx.fillText(displayTitle.slice(0, 42), titleX, titleY);

    if (this.showFooter !== false) {
      const subFontPx = Math.floor(Math.min(w, h) * 0.019);
      ctx.fillStyle = pal.primary;
      ctx.font = `600 ${subFontPx}px "${this.fontFamily}", system-ui, sans-serif`;
      const durLabel = totalDuration > 0
        ? `${this.formatTime(currentTime)} / ${this.formatTime(totalDuration)}`
        : this.formatTime(currentTime);

      const brandLine = `${this.studioName} • ${this.studioSubtitle} • ${durLabel}`;
      ctx.fillText(brandLine, titleX, titleY + Math.floor(titleFontPx * 0.92));
    }

    const titleBoxW = Math.max(340, w * 0.44);
    const titleBoxH = titleFontPx * 2.8;
    this.lastComponentBoxes.title = {
      id: 'title',
      name: 'Title & Footer',
      x: titleX - titleBoxW / 2,
      y: titleY - titleFontPx * 1.1,
      w: titleBoxW,
      h: titleBoxH,
      cx: titleX,
      cy: titleY
    };

    // Bottom Progress Accent Line
    if (totalDuration > 0) {
      const ratio = Math.max(0, Math.min(1, currentTime / totalDuration));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(0, h - 8, w, 8);
      const pGrad = ctx.createLinearGradient(0, 0, w * ratio, 0);
      pGrad.addColorStop(0, pal.primary);
      pGrad.addColorStop(1, pal.secondary);
      ctx.fillStyle = pGrad;
      ctx.fillRect(0, h - 8, w * ratio, 8);
    }
    ctx.restore();

    // 9. Broadcast Watermark Badge (Custom Logo PNG or Corner Brand Pill)
    if (this.watermarkPos && this.watermarkPos !== 'none') {
      ctx.save();
      const margin = 36;
      if (this.watermarkLogoImg && this.watermarkLogoImg.complete && this.watermarkLogoImg.naturalWidth > 0) {
        const logoTargetW = Math.max(30, Math.min(260, this.watermarkLogoSize || 80));
        const aspect = this.watermarkLogoImg.naturalHeight / (this.watermarkLogoImg.naturalWidth || 1);
        const logoTargetH = logoTargetW * aspect;

        let lx = margin;
        let ly = margin;
        if (this.watermarkPos === 'top-right') {
          lx = w - margin - logoTargetW;
          ly = margin;
        } else if (this.watermarkPos === 'bottom-left') {
          lx = margin;
          ly = h - margin - logoTargetH;
        } else if (this.watermarkPos === 'bottom-right') {
          lx = w - margin - logoTargetW;
          ly = h - margin - logoTargetH;
        }

        ctx.globalAlpha = Math.max(0.1, Math.min(1.0, this.watermarkLogoOpacity !== undefined ? this.watermarkLogoOpacity : 0.9));
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 14;
        ctx.drawImage(this.watermarkLogoImg, lx, ly, logoTargetW, logoTargetH);
      } else {
        const badgeText = `✦ ${this.studioName.toUpperCase()}`;
        const badgeFontPx = Math.floor(Math.min(w, h) * 0.018);
        ctx.font = `800 ${badgeFontPx}px "${this.fontFamily}", system-ui, sans-serif`;
        const textW = ctx.measureText(badgeText).width;
        const badgeW = textW + 28;
        const badgeH = badgeFontPx * 2.1;

        let bx = margin;
        let by = margin;
        if (this.watermarkPos === 'top-right') {
          bx = w - margin - badgeW;
          by = margin;
        } else if (this.watermarkPos === 'bottom-left') {
          bx = margin;
          by = h - margin - badgeH;
        } else if (this.watermarkPos === 'bottom-right') {
          bx = w - margin - badgeW;
          by = h - margin - badgeH;
        }

        ctx.fillStyle = 'rgba(15, 23, 42, 0.74)';
        ctx.strokeStyle = `rgba(${pal.glow}, 0.38)`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, badgeH / 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pal.primary;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, bx + badgeW / 2, by + badgeH / 2 + 1);
      }
      ctx.restore();
    }

    // 9.5 Ad & Promo Studio Overlays (Top Hook Banner, Urgency Badge, Pulsing Bottom CTA Dock)
    if (this.isAdMode) {
      this._drawAdOverlays(ctx, w, h, pal, energy, currentTime, isVertical, isLandscape);
    }

    // 10. Interactive Drag-and-Drop Guides (Studio Preview Only, Never in Exported Video)
    if (!this.isRecording && this.showDragGuides !== false) {
      const activeId = this.activeDragComponent;
      const hoverId = this.hoveredComponent;
      const targetId = activeId || hoverId;

      if (targetId && this.lastComponentBoxes && this.lastComponentBoxes[targetId]) {
        const b = this.lastComponentBoxes[targetId];
        ctx.save();

        // Alignment Snap Guide Lines
        if (activeId) {
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([8, 8]);

          // Center-X alignment guide
          if (Math.abs(b.cx - w / 2) < 8) {
            ctx.beginPath();
            ctx.moveTo(w / 2, 0);
            ctx.lineTo(w / 2, h);
            ctx.stroke();
          }

          // Center-Y alignment guide
          if (Math.abs(b.cy - h / 2) < 8) {
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
          }
        }

        // Bounding Selection Box
        const pad = 8;
        const boxX = b.x - pad;
        const boxY = b.y - pad;
        const boxW = b.w + pad * 2;
        const boxH = b.h + pad * 2;

        ctx.strokeStyle = activeId ? '#38bdf8' : 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = activeId ? 3.5 : 2;
        ctx.setLineDash(activeId ? [] : [6, 6]);

        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 10);
        ctx.stroke();

        // 4 Corner Drag Grips
        if (activeId) {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          const handleSize = 12;
          const corners = [
            [boxX - handleSize / 2, boxY - handleSize / 2],
            [boxX + boxW - handleSize / 2, boxY - handleSize / 2],
            [boxX - handleSize / 2, boxY + boxH - handleSize / 2],
            [boxX + boxW - handleSize / 2, boxY + boxH - handleSize / 2]
          ];
          for (const [hx, hy] of corners) {
            ctx.fillRect(hx, hy, handleSize, handleSize);
            ctx.strokeRect(hx, hy, handleSize, handleSize);
          }
        }

        // Floating Tag Badge
        const badgeLabel = `✥ ${b.name} (${Math.round((b.cx / w) * 100)}%, ${Math.round((b.cy / h) * 100)}%)`;
        ctx.font = '700 18px system-ui, sans-serif';
        const textMetrics = ctx.measureText(badgeLabel);
        const tagW = textMetrics.width + 24;
        const tagH = 30;
        const tagX = Math.max(12, Math.min(w - tagW - 12, boxX));
        const tagY = Math.max(12, boxY - tagH - 8);

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = activeId ? '#38bdf8' : '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.roundRect(tagX, tagY, tagW, tagH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = activeId ? '#38bdf8' : '#e0f2fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeLabel, tagX + tagW / 2, tagY + tagH / 2);

        ctx.restore();
      }
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  /**
   * Hit test to find which interactive canvas component is under pointer
   */
  getHitComponent(canvasX, canvasY) {
    const boxes = this.lastComponentBoxes;
    if (!boxes) return null;

    const checkOrder = ['lyrics', 'artwork', 'visualizer', 'title'];
    for (const key of checkOrder) {
      const b = boxes[key];
      if (b) {
        const pad = 14;
        if (
          canvasX >= b.x - pad &&
          canvasX <= b.x + b.w + pad &&
          canvasY >= b.y - pad &&
          canvasY <= b.y + b.h + pad
        ) {
          return b;
        }
      }
    }
    return null;
  }

  /**
   * Sets up pointer drag interaction on canvas
   */
  setupDragInteraction(canvas, onPositionChange) {
    if (!canvas) return;
    this.canvas = canvas;
    this.onPositionChange = onPositionChange;

    const getCanvasCoords = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    const onPointerDown = (e) => {
      if (this.isRecording) return;
      const coords = getCanvasCoords(e);
      const hit = this.getHitComponent(coords.x, coords.y);
      if (hit) {
        this.activeDragComponent = hit.id;
        this.dragOffset = {
          dx: coords.x - hit.cx,
          dy: coords.y - hit.cy
        };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (err) {}
        canvas.style.cursor = 'grabbing';
        if (!this.isPreviewing) {
          this.renderStaticAtTime(this.lastRenderTime || 0);
        }
      }
    };

    const onPointerMove = (e) => {
      if (this.isRecording) return;
      const coords = getCanvasCoords(e);
      const w = canvas.width;
      const h = canvas.height;

      if (this.activeDragComponent) {
        let newCx = coords.x - this.dragOffset.dx;
        let newCy = coords.y - this.dragOffset.dy;

        // Smart snap to center axes (+/- 2.5% threshold)
        if (Math.abs(newCx - w / 2) < w * 0.025) newCx = w / 2;
        if (Math.abs(newCy - h / 2) < h * 0.025) newCy = h / 2;

        newCx = Math.max(w * 0.05, Math.min(w * 0.95, newCx));
        newCy = Math.max(h * 0.05, Math.min(h * 0.95, newCy));

        if (!this.customPositions) {
          this.customPositions = { artwork: null, visualizer: null, lyrics: null, title: null };
        }
        this.customPositions[this.activeDragComponent] = {
          x: Math.round((newCx / w) * 1000) / 1000,
          y: Math.round((newCy / h) * 1000) / 1000
        };

        if (this.onPositionChange) {
          this.onPositionChange(this.activeDragComponent, this.customPositions[this.activeDragComponent]);
        }
        if (!this.isPreviewing) {
          this.renderStaticAtTime(this.lastRenderTime || 0);
        }
      } else {
        const hit = this.getHitComponent(coords.x, coords.y);
        const newHoverId = hit ? hit.id : null;
        if (newHoverId !== this.hoveredComponent) {
          this.hoveredComponent = newHoverId;
          canvas.style.cursor = hit ? 'grab' : 'default';
          if (!this.isPreviewing) {
            this.renderStaticAtTime(this.lastRenderTime || 0);
          }
        }
      }
    };

    const onPointerUp = (e) => {
      if (this.activeDragComponent) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch (err) {}
        this.activeDragComponent = null;
        canvas.style.cursor = this.hoveredComponent ? 'grab' : 'default';
        if (!this.isPreviewing) {
          this.renderStaticAtTime(this.lastRenderTime || 0);
        }
        if (this.onPositionChange) {
          this.onPositionChange('saved', this.customPositions);
        }
      }
    };

    const onPointerLeave = () => {
      if (!this.activeDragComponent && this.hoveredComponent) {
        this.hoveredComponent = null;
        canvas.style.cursor = 'default';
        if (!this.isPreviewing) {
          this.renderStaticAtTime(this.lastRenderTime || 0);
        }
      }
    };

    if (this._pointerDownHandler) {
      canvas.removeEventListener('pointerdown', this._pointerDownHandler);
      canvas.removeEventListener('pointermove', this._pointerMoveHandler);
      canvas.removeEventListener('pointerup', this._pointerUpHandler);
      canvas.removeEventListener('pointercancel', this._pointerUpHandler);
      canvas.removeEventListener('pointerleave', this._pointerLeaveHandler);
    }

    this._pointerDownHandler = onPointerDown;
    this._pointerMoveHandler = onPointerMove;
    this._pointerUpHandler = onPointerUp;
    this._pointerLeaveHandler = onPointerLeave;

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
  }

  resetCustomPositions(comp = null) {
    if (comp) {
      if (this.customPositions) this.customPositions[comp] = null;
    } else {
      this.customPositions = {
        artwork: null,
        visualizer: null,
        lyrics: null,
        title: null
      };
    }
    this.renderStaticAtTime(this.lastRenderTime || 0);
  }

  /**
   * Static scrub renderer for instant timeline inspection without playing audio
   */
  renderStaticAtTime(currentTimeSec, totalDuration = 0) {
    this.lastRenderTime = currentTimeSec;
    const dur = totalDuration || (this.songMeta && this.songMeta.duration) || 180;
    const fakeFreq = new Uint8Array(128);
    for (let i = 0; i < 128; i++) {
      fakeFreq[i] = Math.round(90 + Math.sin(i * 0.25 + currentTimeSec) * 65 + Math.cos(i * 0.11) * 40);
    }
    this.drawFrame(fakeFreq, currentTimeSec, dur);
  }

  /**
   * Starts live audio + canvas preview inside Video Studio modal without recording
   */
  startPreview(audioBuffer, songMeta, startOffset = 0, onTick = null) {
    this.stop();
    this.audioBuffer = audioBuffer;
    const existingCustomLyrics = this.customLyricsText ?? songMeta?.customLyrics ?? null;
    this.setSongMeta(songMeta, audioBuffer.duration);
    if (existingCustomLyrics !== null) {
      this.setCustomLyrics(existingCustomLyrics, audioBuffer.duration);
    }
    this.updateCanvasDimensions();
    this.onTick = onTick;

    this.audioCtx = AudioConverter.getAudioContext();
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.78;

    this._startSourceAt(startOffset);
  }

  _startSourceAt(offsetSec = 0) {
    if (!this.audioBuffer || !this.audioCtx) return;
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
    }

    const totalDur = this.audioBuffer.duration;
    const clampedOffset = Math.max(0, Math.min(totalDur - 0.05, offsetSec));

    this.sourceNode = this.audioCtx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    this.previewStartAudioTime = this.audioCtx.currentTime;
    this.previewStartOffset = clampedOffset;
    this.isPreviewing = true;

    this.sourceNode.onended = () => {
      if (this.isPreviewing && (this.getCurrentPreviewTime() >= totalDur - 0.25)) {
        this.stop();
        if (this.onPreviewEnded) this.onPreviewEnded();
      }
    };

    this.sourceNode.start(0, clampedOffset);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const freqData = new Uint8Array(this.analyser.frequencyBinCount);
    const loop = () => {
      if (!this.isPreviewing) {
        this.animationFrameId = null;
        return;
      }
      const currentSec = this.getCurrentPreviewTime();
      this.lastRenderTime = currentSec;
      this.analyser.getByteFrequencyData(freqData);
      this.drawFrame(freqData, currentSec, totalDur);

      if (typeof this.onTick === 'function') {
        try {
          this.onTick(currentSec, totalDur);
        } catch (e) {
          console.warn('onTick callback error:', e);
        }
      }

      if (currentSec < totalDur) {
        this.animationFrameId = requestAnimationFrame(loop);
      } else {
        this.stop();
        if (this.onPreviewEnded) this.onPreviewEnded();
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  getCurrentPreviewTime() {
    if (!this.audioCtx || typeof this.previewStartAudioTime !== 'number') {
      return this.previewStartOffset || 0;
    }
    const elapsed = Math.max(0, this.audioCtx.currentTime - this.previewStartAudioTime);
    const totalDur = (this.audioBuffer && this.audioBuffer.duration) || 180;
    return Math.min(totalDur, (this.previewStartOffset || 0) + elapsed);
  }

  seekPreview(seekSec) {
    if (this.isPreviewing && this.audioBuffer) {
      this._startSourceAt(seekSec);
    } else {
      this.renderStaticAtTime(seekSec);
    }
  }

  stopPreview() {
    this.isPreviewing = false;
    this.previewStartAudioTime = null;
    this.previewStartOffset = 0;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }
    if (this.canvas) {
      this.canvas.style.cursor = 'default';
    }
  }

  /**
   * Renders and exports 1080p video using MediaRecorder and AudioBuffer at chosen FPS & bitrate
   */
  async exportVideo(audioBuffer, songMeta, coverUrl, onProgress = () => {}) {
    this.stop();
    const operation = { cancelled: false, completed: false };
    this._exportOperation = operation;
    const assertActive = () => {
      if (operation.cancelled || this._exportOperation !== operation) throw new Error('Video rendering was cancelled. No partial video was exported.');
    };
    this.audioBuffer = audioBuffer;
    const existingCustomLyrics = this.customLyricsText ?? songMeta?.customLyrics ?? null;
    this.setSongMeta(songMeta, audioBuffer.duration);
    if (existingCustomLyrics !== null) {
      this.setCustomLyrics(existingCustomLyrics, audioBuffer.duration);
    }
    this.updateCanvasDimensions();

    onProgress(2, 'Loading album artwork & label...');
    await this.loadCoverImage(coverUrl);
    assertActive();

    if (this.customCoverDataUrl) {
      await this.loadCustomCover(this.customCoverDataUrl);
      assertActive();
    }

    if (this.customBgDataUrl) {
      onProgress(4, 'Loading custom cinema background...');
      await this.loadBackgroundImage(this.customBgDataUrl);
      assertActive();
    }

    if (this.watermarkLogoDataUrl && !this.watermarkLogoImg) {
      await this.loadWatermarkLogo(this.watermarkLogoDataUrl);
      assertActive();
    }

    onProgress(6, 'Initializing Web Audio stream...');
    this.audioCtx = AudioConverter.getAudioContext();

    await this.audioCtx.resume();
    assertActive();
    const dest = this.audioCtx.createMediaStreamDestination();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.78;

    this.sourceNode = this.audioCtx.createBufferSource();
    this.sourceNode.buffer = audioBuffer;
    this.sourceNode.connect(this.analyser);
    this.sourceNode.connect(dest);

    const streamFps = this.fps || 60;
    const canvasStream = this.canvas.captureStream(streamFps);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    let mimeType = 'video/webm; codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }
    if (MediaRecorder.isTypeSupported('video/mp4; codecs="avc1,mp4a.40.2"')) {
      mimeType = 'video/mp4; codecs="avc1,mp4a.40.2"';
    }

    const bitRate = (this.bitrateMbps || 12) * 1000000;
    this.recordedChunks = [];
    try {
      this.mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitRate });
    } catch (error) {
      combinedStream.getTracks().forEach(track => track.stop());
      this.sourceNode.disconnect();
      throw error;
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    return new Promise((resolve, reject) => {
      const totalDuration = audioBuffer.duration;
      const freqData = new Uint8Array(this.analyser.frequencyBinCount);
      const startAudioTime = this.audioCtx.currentTime;

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        if (this.sourceNode) {
          try { this.sourceNode.stop(); } catch (e) {}
        }
        cancelAnimationFrame(this.animationFrameId);
        const videoBlob = new Blob(this.recordedChunks, { type: mimeType });
        combinedStream.getTracks().forEach(track => track.stop());
        this.sourceNode?.disconnect();
        this.analyser?.disconnect();
        if (operation.cancelled || !operation.completed) reject(new Error('Video rendering was cancelled. No partial video was exported.'));
        else if (videoBlob.size === 0) reject(new Error('Video recording produced no data.'));
        else {
          onProgress(100, `Packaging ${this.resolution || '1080p'} video file...`);
          resolve(videoBlob);
        }
      };

      this.mediaRecorder.onerror = (err) => {
        this.isRecording = false;
        cancelAnimationFrame(this.animationFrameId);
        combinedStream.getTracks().forEach(track => track.stop());
        try { this.sourceNode?.stop(); } catch {}
        reject(err.error || new Error('Video recording failed.'));
      };

      this.isRecording = true;
      try {
        this.mediaRecorder.start(200);
        this.sourceNode.start(0);
      } catch (error) {
        this.stop();
        combinedStream.getTracks().forEach(track => track.stop());
        reject(error);
        return;
      }

      const render = () => {
        if (!this.isRecording) return;

        const elapsedSec = Math.max(0, this.audioCtx.currentTime - startAudioTime);
        this.analyser.getByteFrequencyData(freqData);
        this.drawFrame(freqData, elapsedSec, totalDuration);

        const percent = Math.min(99, Math.floor((elapsedSec / totalDuration) * 100));
        onProgress(percent, `Rendering frame: ${this.formatTime(elapsedSec)} / ${this.formatTime(totalDuration)} (${percent}%)`);

        if (elapsedSec >= totalDuration) {
          operation.completed = true;
          this.mediaRecorder.stop();
        } else {
          this.animationFrameId = requestAnimationFrame(render);
        }
      };

      this.animationFrameId = requestAnimationFrame(render);
    });
  }

  setParticleStyle(style) {
    this.particleStyle = style;
  }

  setParticleSpeed(speed) {
    this.particleSpeed = Math.max(0.1, Math.min(3.0, speed));
  }

  setSlides(slides) {
    this.slides = slides || [];
  }

  addSlide(img, dataUrl = null) {
    if (!this.slides) this.slides = [];
    this.slides.push({ img, dataUrl });
  }

  clearSlides() {
    this.slides = [];
  }

  setSlideTransition(transition) {
    this.slideTransition = transition || 'crossfade';
  }

  setSlideDurationSettings(durationSec, transitionSec) {
    this.slideDurationSec = Math.max(0, Number(durationSec) || 0);
    if (transitionSec !== undefined) {
      this.slideTransitionSec = Math.max(0.2, Math.min(6.0, Number(transitionSec) || 1.2));
    }
  }

  setVizSensitivity(gain) {
    this.vizSensitivity = Math.max(0.2, Math.min(4.0, Number(gain) || 1.0));
  }

  setLyricTypography(options = {}) {
    if (options.fontFamily) this.fontFamily = options.fontFamily;
    if (options.strokeWidth !== undefined) this.lyricStrokeWidth = Math.max(0, Math.min(12, Number(options.strokeWidth)));
    if (options.strokeColor) this.lyricStrokeColor = options.strokeColor;
    if (options.scrimEnabled !== undefined) this.lyricScrimEnabled = !!options.scrimEnabled;
    if (options.scrimOpacity !== undefined) this.lyricScrimOpacity = Math.max(0, Math.min(1.0, Number(options.scrimOpacity)));
  }

  async loadWatermarkLogo(urlOrDataUrl) {
    this.watermarkLogoDataUrl = urlOrDataUrl || null;
    if (!urlOrDataUrl) {
      this.watermarkLogoImg = null;
      return null;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.watermarkLogoImg = img;
        resolve(img);
      };
      img.onerror = () => {
        this.watermarkLogoImg = null;
        resolve(null);
      };
      img.src = urlOrDataUrl;
    });
  }

  async setWatermarkLogo(dataUrl, size, opacity) {
    if (size !== undefined) this.watermarkLogoSize = Math.max(20, Math.min(260, Number(size) || 80));
    if (opacity !== undefined) this.watermarkLogoOpacity = Math.max(0.1, Math.min(1.0, Number(opacity) || 0.9));
    return this.loadWatermarkLogo(dataUrl);
  }

  setAudioSourceType(type) {
    this.audioSourceType = (type === 'instrumental' || type === 'vocals') ? type : 'master';
  }

  setAdMode(isAdMode) {
    this.isAdMode = !!isAdMode;
  }

  setAdConfig(config = {}) {
    this.adConfig = { ...this.adConfig, ...config };
  }

  applyPreset(presetKey) {
    if (presetKey === 'tiktok_story') {
      this.aspectRatio = '9:16';
      this.artMode = 'none';
      this.bgMotion = 'ken-burns';
      this.showParticles = true;
      this.particleStyle = 'starfield';
      this.lyricAnimation = 'capcut_bounce';
      this.lyricPosition = 'center';
      this.visualStyle = 'bars';
      this.vizPosition = 'bottom_dock';
      this.theme = 'sunset';
      this.isAdMode = false;
    } else if (presetKey === 'youtube_widescreen') {
      this.aspectRatio = '16:9';
      this.artMode = 'vinyl';
      this.bgMotion = 'pan_drift';
      this.showParticles = true;
      this.particleStyle = 'embers';
      this.lyricAnimation = 'floating_wave';
      this.lyricPosition = 'lower-third';
      this.visualStyle = 'wave';
      this.vizPosition = 'below_artwork';
      this.theme = 'cyber';
      this.isAdMode = false;
    } else if (presetKey === 'quote_card') {
      this.aspectRatio = '1:1';
      this.artMode = 'none';
      this.bgMotion = 'static';
      this.bgDimOpacity = 0.65;
      this.showParticles = true;
      this.particleStyle = 'constellation';
      this.lyricAnimation = 'highlighter';
      this.lyricPosition = 'center';
      this.visualStyle = 'mirrored_bars';
      this.vizPosition = 'bottom_dock';
      this.fontFamily = 'Playfair Display';
      this.theme = 'mono';
      this.isAdMode = false;
    } else if (presetKey === 'ad_promo') {
      this.aspectRatio = '9:16';
      this.artMode = 'card';
      this.bgMotion = 'pulse';
      this.showParticles = true;
      this.particleStyle = 'gold_dust';
      this.isAdMode = true;
      if (!this.adConfig.topHookText) this.adConfig.topHookText = 'LIMITED TIME SPECIAL OFFER';
      if (!this.adConfig.bottomCtaText) this.adConfig.bottomCtaText = 'Order on WhatsApp • Fast Delivery';
      if (!this.adConfig.urgencyBadge) this.adConfig.urgencyBadge = 'FLASH SALE';
      this.theme = 'emerald';
    } else if (presetKey === 'karaoke_pro') {
      this.aspectRatio = '16:9';
      this.artMode = 'card';
      this.showLyrics = true;
      this.lyricAnimation = 'karaoke_wipe';
      this.visualStyle = 'circular';
      this.vizPosition = 'around_artwork';
      this.showParticles = true;
      this.particleStyle = 'ripples';
      this.theme = 'cyber';
      this.isAdMode = false;
    } else if (presetKey === 'love_story' || presetKey === 'romantic') {
      this.aspectRatio = '9:16';
      this.artMode = 'card';
      this.theme = 'love';
      this.bgMotion = 'ken-burns-dynamic';
      this.slideTransition = 'heart_wipe';
      this.showParticles = true;
      this.particleStyle = 'floating_hearts';
      this.lyricAnimation = 'capcut_bounce';
      this.lyricPosition = 'center';
      this.visualStyle = 'radial';
      this.vizPosition = 'below_artwork';
      this.isAdMode = false;
    }
    this.updateCanvasDimensions();
  }

  _drawParticleField(ctx, w, h, pal, energy, currentTime, cx, cy, currentCoverSize, isVertical, isLandscape) {
    const style = this.particleStyle || 'dust';
    const speedMult = this.particleSpeed || 1.0;

    ctx.save();

    if (style === 'starfield') {
      const centerX = cx || w / 2;
      const centerY = cy || h / 2;
      const warpEnergy = 1.0 + energy * 3.5;

      for (const p of this.particles) {
        p.prevX = centerX + ((p.x - 0.5) * w) / (p.z + 0.001);
        p.prevY = centerY + ((p.y - 0.5) * h) / (p.z + 0.001);

        p.z -= p.speed * 0.015 * speedMult * warpEnergy;
        if (p.z <= 0.04) {
          p.z = 1.0;
          p.x = Math.random();
          p.y = Math.random();
          p.prevX = centerX + ((p.x - 0.5) * w) / p.z;
          p.prevY = centerY + ((p.y - 0.5) * h) / p.z;
        }

        const sx = centerX + ((p.x - 0.5) * w) / p.z;
        const sy = centerY + ((p.y - 0.5) * h) / p.z;

        if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) {
          const starAlpha = Math.min(1.0, (1.0 - p.z) * (0.4 + energy * 0.6));
          const starColor = p.colorType === 0 ? pal.primary : (p.colorType === 1 ? pal.secondary : '#ffffff');
          const starSize = Math.max(1, ((1.0 - p.z) * p.size * 1.8) * (1 + energy * 0.5));

          ctx.strokeStyle = starColor;
          ctx.fillStyle = starColor;
          ctx.globalAlpha = starAlpha;
          ctx.lineWidth = Math.max(1, starSize * 0.8);
          ctx.shadowColor = starColor;
          ctx.shadowBlur = energy > 0.4 ? 12 : 4;

          ctx.beginPath();
          ctx.moveTo(p.prevX, p.prevY);
          ctx.lineTo(sx, sy);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(sx, sy, starSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (style === 'embers') {
      for (const p of this.particles) {
        p.y -= p.speed * 0.0028 * speedMult * (1 + energy * 2.0);
        p.x += Math.sin(currentTime * 1.8 + p.id) * 0.0006;
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = Math.random();
        }

        const px = p.x * w;
        const py = p.y * h;
        const emberSize = p.size * (1 + energy * 0.6);
        const emberAlpha = p.opacity * (0.4 + energy * 0.6);

        const emberGrad = ctx.createRadialGradient(px, py, 0, px, py, emberSize * 2.2);
        emberGrad.addColorStop(0, '#fff7ed');
        emberGrad.addColorStop(0.35, '#f97316');
        emberGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');

        ctx.fillStyle = emberGrad;
        ctx.globalAlpha = emberAlpha;
        ctx.beginPath();
        ctx.arc(px, py, emberSize * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'constellation') {
      const maxDist = Math.min(w, h) * 0.15;
      const count = Math.min(this.particles.length, 50);

      for (let i = 0; i < count; i++) {
        const p = this.particles[i];
        p.x += (p.vx || 0.002) * speedMult * (1 + energy * 1.4);
        p.y += (p.vy || 0.002) * speedMult * (1 + energy * 1.4);
        if (p.x < 0 || p.x > 1) p.vx = -(p.vx || 0.002);
        if (p.y < 0 || p.y > 1) p.vy = -(p.vy || 0.002);
      }

      for (let i = 0; i < count; i++) {
        const p1 = this.particles[i];
        const x1 = p1.x * w;
        const y1 = p1.y * h;

        for (let j = i + 1; j < count; j++) {
          const p2 = this.particles[j];
          const x2 = p2.x * w;
          const y2 = p2.y * h;
          const dx = x1 - x2;
          const dy = y1 - y2;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDist) {
            const lineAlpha = (1 - dist / maxDist) * 0.35 * (0.4 + energy * 0.6);
            ctx.strokeStyle = pal.primary;
            ctx.globalAlpha = lineAlpha;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }

        ctx.fillStyle = pal.secondary;
        ctx.globalAlpha = 0.55 + energy * 0.45;
        ctx.beginPath();
        ctx.arc(x1, y1, p1.size * (1 + energy * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'ripples') {
      const centerX = cx || w / 2;
      const centerY = cy || h / 2;
      const maxR = Math.min(w, h) * 0.68;
      const ringCount = 8;

      for (let i = 0; i < ringCount; i++) {
        const cycle = ((currentTime * 0.45 * speedMult + i / ringCount) % 1.0);
        const r = cycle * maxR;
        const ringAlpha = (1 - cycle) * (0.3 + energy * 0.65);

        ctx.strokeStyle = i % 2 === 0 ? pal.primary : pal.secondary;
        ctx.globalAlpha = ringAlpha;
        ctx.lineWidth = 2 + energy * 5;
        ctx.shadowColor = pal.primary;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (style === 'rain') {
      for (const p of this.particles) {
        p.y += p.speed * 0.025 * speedMult;
        p.x += 0.001 * speedMult;
        if (p.y > 1.02) {
          p.y = -0.02;
          p.x = Math.random();
        }

        const px = p.x * w;
        const py = p.y * h;
        const streakLen = 14 + p.speed * 120 * (1 + energy * 0.5);

        ctx.strokeStyle = 'rgba(186, 230, 253, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = p.opacity * (0.4 + energy * 0.5);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + streakLen * 0.15, py + streakLen);
        ctx.stroke();
      }
    } else if (style === 'gold_dust') {
      for (const p of this.particles) {
        p.y -= p.speed * 0.0018 * speedMult * (1 + energy * 1.5);
        p.x += Math.sin(currentTime * 1.2 + p.id) * 0.0004;
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = Math.random();
        }

        const px = p.x * w;
        const py = p.y * h;
        const goldSize = p.size * (1 + energy * 0.5);

        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 10;
        ctx.globalAlpha = p.opacity * (0.45 + energy * 0.55);
        ctx.beginPath();
        ctx.arc(px, py, goldSize, 0, Math.PI * 2);
        ctx.fill();

        if (p.id % 5 === 0) {
          const flareR = goldSize * 3.5 * (1 + energy * 0.8);
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px - flareR, py);
          ctx.lineTo(px + flareR, py);
          ctx.moveTo(px, py - flareR);
          ctx.lineTo(px, py + flareR);
          ctx.stroke();
        }
      }
    } else if (style === 'lightning') {
      const centerX = cx || w / 2;
      const centerY = cy || h / 2;
      const trigger = energy > 0.38 || (Math.sin(currentTime * 8) > 0.7);

      if (trigger) {
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 18;
        ctx.lineWidth = 2.5 + energy * 4;
        ctx.globalAlpha = 0.85;

        ctx.beginPath();
        let lx = Math.random() < 0.5 ? 0 : w;
        let ly = Math.random() * h;
        ctx.moveTo(lx, ly);

        const segments = 8;
        for (let s = 0; s < segments; s++) {
          const targetX = centerX + (Math.random() - 0.5) * (currentCoverSize || 300);
          const targetY = centerY + (Math.random() - 0.5) * (currentCoverSize || 300);
          lx += (targetX - lx) * (1 / (segments - s)) + (Math.random() - 0.5) * 80;
          ly += (targetY - ly) * (1 / (segments - s)) + (Math.random() - 0.5) * 80;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      }
    } else if (style === 'aurora') {
      const bands = 3;
      for (let b = 0; b < bands; b++) {
        const bandY = h * (0.35 + b * 0.18);
        const waveGrad = ctx.createLinearGradient(0, bandY - 120, 0, bandY + 120);
        waveGrad.addColorStop(0, 'rgba(52, 211, 153, 0)');
        waveGrad.addColorStop(0.5, b === 1 ? 'rgba(34, 211, 238, 0.28)' : 'rgba(168, 85, 247, 0.24)');
        waveGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');

        ctx.fillStyle = waveGrad;
        ctx.globalAlpha = 0.65 + energy * 0.35;
        ctx.beginPath();
        ctx.moveTo(0, h);

        const steps = 40;
        for (let i = 0; i <= steps; i++) {
          const x = (i / steps) * w;
          const y = bandY + Math.sin(x * 0.0035 + currentTime * 1.5 * speedMult + b * 1.8) * (60 + energy * 80) + Math.cos(x * 0.007 - currentTime) * 25;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }
    } else if (style === 'firestorm') {
      for (const p of this.particles) {
        p.y -= (0.004 + p.speed * 0.006) * speedMult * (1 + energy * 2.8);
        p.x += (Math.random() - 0.5) * 0.004 + Math.sin(currentTime * 3 + p.id) * 0.001;
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = 0.2 + Math.random() * 0.6;
        }

        const px = p.x * w;
        const py = p.y * h;
        const pSize = p.size * (1 + energy * 0.8);

        ctx.fillStyle = p.colorType === 0 ? '#ef4444' : (p.colorType === 1 ? '#f97316' : '#eab308');
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 12;
        ctx.globalAlpha = p.opacity * (0.5 + energy * 0.5);
        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'cyber_grid') {
      const horizonY = h * 0.62;
      ctx.strokeStyle = pal.primary;
      ctx.globalAlpha = 0.35 + energy * 0.45;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = pal.primary;
      ctx.shadowBlur = 8;

      const numLines = 14;
      for (let i = 0; i <= numLines; i++) {
        const bottomX = (i / numLines) * w;
        ctx.beginPath();
        ctx.moveTo(w / 2, horizonY);
        ctx.lineTo(bottomX, h);
        ctx.stroke();
      }

      const numRungs = 8;
      for (let r = 0; r < numRungs; r++) {
        const progress = ((currentTime * 0.35 * speedMult + r / numRungs) % 1.0);
        const rungY = horizonY + Math.pow(progress, 2.2) * (h - horizonY);
        const waveOffset = Math.sin(progress * Math.PI * 4 + currentTime * 5) * (energy * 18);

        ctx.beginPath();
        ctx.moveTo(0, rungY + waveOffset);
        ctx.lineTo(w, rungY + waveOffset);
        ctx.stroke();
      }
    } else if (style === 'orbit_rings') {
      const centerX = cx || w / 2;
      const centerY = cy || h / 2;
      const baseR = (currentCoverSize || 320) * 0.68;

      for (let ring = 0; ring < 3; ring++) {
        const rotAngle = currentTime * (0.8 + ring * 0.4) * speedMult;
        const ringR = baseR * (1 + ring * 0.28) * (1 + energy * 0.08);

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(rotAngle + ring * (Math.PI / 3));
        ctx.scale(1.0, 0.42);

        ctx.strokeStyle = ring === 0 ? pal.primary : (ring === 1 ? pal.secondary : '#38bdf8');
        ctx.lineWidth = 2.5 + energy * 3;
        ctx.shadowColor = pal.primary;
        ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.65 + energy * 0.35;

        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.stroke();

        const pearlAngle = currentTime * 2.5 + ring;
        const px = Math.cos(pearlAngle) * ringR;
        const py = Math.sin(pearlAngle) * ringR;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, 4.5 + energy * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    } else if (style === 'floating_hearts') {
      for (const p of this.particles) {
        // Audio rhythm following: speed scales with song tempo/energy
        p.y -= (0.0018 + p.speed * 0.003) * speedMult * (1 + energy * 2.4);
        p.x += Math.sin(currentTime * 2.2 + p.id) * 0.0008;
        if (p.y < -0.06) {
          p.y = 1.06;
          p.x = Math.random();
        }

        const px = p.x * w;
        const py = p.y * h;
        // Rhythm bounce / heartbeat
        const beatScale = 1.0 + Math.sin(currentTime * 8 + p.id) * 0.12 + energy * 0.55;
        const hSize = (p.size * 2.8 + 6) * beatScale;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.sin(currentTime * 2.5 + p.id) * 0.22);
        ctx.scale(hSize / 18, hSize / 18);

        const heartColor = p.colorType === 0 ? '#f43f5e' : (p.colorType === 1 ? '#ec4899' : '#fb7185');
        ctx.fillStyle = heartColor;
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 10 + energy * 14;
        ctx.globalAlpha = p.opacity * (0.65 + energy * 0.35);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-8, -12, -18, 3, 0, 16);
        ctx.bezierCurveTo(18, 3, 8, -12, 0, 0);
        ctx.closePath();
        ctx.fill();

        // Center sparkle on high rhythm beat
        if (energy > 0.4 && (p.id % 4 === 0)) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-2, 2, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    } else if (style === 'emoji_particles') {
      const emojiList = ['💖', '💕', '❤️', '✨', '🌹', '🥰', '🔥', '🎵', '💫', '🎉', '🌟', '💓'];
      for (const p of this.particles) {
        // Audio rhythm: rise speed and sway scale with song energy
        p.y -= (0.0016 + p.speed * 0.0032) * speedMult * (1 + energy * 2.5);
        p.x += Math.sin(currentTime * 2.8 + p.id) * 0.001;
        if (p.y < -0.06) {
          p.y = 1.06;
          p.x = Math.random();
        }

        const px = p.x * w;
        const py = p.y * h;
        const emoji = emojiList[p.id % emojiList.length];
        const emojiSize = Math.max(14, Math.round((16 + (p.id % 14)) * (1.0 + energy * 0.65)));

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.sin(currentTime * 3.0 + p.id) * 0.28);
        ctx.globalAlpha = Math.min(1.0, p.opacity * (0.75 + energy * 0.35));
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = energy > 0.3 ? 12 : 4;
        ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 0, 0);
        ctx.restore();
      }
    } else if (style === 'rose_petals') {
      for (const p of this.particles) {
        // Audio rhythm: floating/swirling petal drift reacting to song energy
        p.y += (0.0022 + p.speed * 0.0035) * speedMult * (1 + energy * 1.6);
        p.x += Math.sin(currentTime * 2.4 + p.id) * 0.002 + Math.cos(currentTime * 1.2 + p.id) * 0.001;
        if (p.y > 1.06) {
          p.y = -0.06;
          p.x = Math.random();
        }

        const px = p.x * w;
        const py = p.y * h;
        const petalW = (p.size * 2.5 + 8) * (1.0 + energy * 0.45);
        const petalH = petalW * 1.5;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(currentTime * (0.8 + (p.id % 3) * 0.4) + p.id);
        ctx.globalAlpha = p.opacity * (0.65 + energy * 0.35);

        const petalGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, petalH);
        petalGrad.addColorStop(0, '#fda4af');
        petalGrad.addColorStop(0.5, '#e11d48');
        petalGrad.addColorStop(1, '#9f1239');

        ctx.fillStyle = petalGrad;
        ctx.shadowColor = '#e11d48';
        ctx.shadowBlur = 8 + energy * 10;

        ctx.beginPath();
        ctx.ellipse(0, 0, petalW * 0.65, petalH * 0.5, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      for (const p of this.particles) {
        p.y -= p.speed * 0.003 * speedMult * (1 + energy * 2.2);
        if (p.y < -0.05) {
          p.y = 1.05;
          p.x = Math.random();
        }

        const px = p.x * w;
        const py = p.y * h;
        const curSize = p.size * (1 + energy * 0.5);

        ctx.beginPath();
        ctx.arc(px, py, curSize, 0, Math.PI * 2);
        let pColor = '#ffffff';
        if (p.colorType === 0) pColor = pal.primary;
        else if (p.colorType === 1) pColor = pal.secondary;

        ctx.fillStyle = pColor;
        ctx.globalAlpha = p.opacity * (0.35 + energy * 0.65);
        ctx.shadowColor = pColor;
        ctx.shadowBlur = 8;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _drawAdOverlays(ctx, w, h, pal, energy, currentTime, isVertical, isLandscape) {
    if (!this.isAdMode || !this.adConfig) return;
    ctx.save();

    if (this.adConfig.topHookText && this.adConfig.topHookText.trim()) {
      const hookText = this.adConfig.topHookText.trim();
      const bannerY = isVertical ? h * 0.08 : h * 0.07;
      const bannerW = Math.min(w * 0.88, 860);
      const bannerH = 64;
      const bannerX = (w - bannerW) / 2;

      ctx.fillStyle = 'rgba(10, 15, 29, 0.88)';
      ctx.strokeStyle = pal.primary;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = pal.primary;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.font = '800 24px Montserrat, Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(hookText, w / 2, bannerY + bannerH / 2);
    }

    if (this.adConfig.urgencyBadge && this.adConfig.urgencyBadge.trim() && this.lastComponentBoxes && this.lastComponentBoxes.artwork) {
      const art = this.lastComponentBoxes.artwork;
      const badgeText = `★ ${this.adConfig.urgencyBadge.trim().toUpperCase()} ★`;
      const badgeX = art.x - 10;
      const badgeY = art.y - 12;

      ctx.save();
      ctx.translate(badgeX + 60, badgeY + 18);
      ctx.rotate(-0.09);

      const badgeGrad = ctx.createLinearGradient(-70, 0, 70, 0);
      badgeGrad.addColorStop(0, '#ef4444');
      badgeGrad.addColorStop(1, '#f97316');

      ctx.fillStyle = badgeGrad;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.roundRect(-80, -18, 160, 36, 18);
      ctx.fill();

      ctx.font = '900 15px Montserrat, Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, 0, 0);
      ctx.restore();
    }

    if (this.adConfig.bottomCtaText && this.adConfig.bottomCtaText.trim()) {
      const ctaText = this.adConfig.bottomCtaText.trim();
      const ctaY = isVertical ? h * 0.84 : (isLandscape ? h * 0.86 : h * 0.84);
      const ctaW = Math.min(w * 0.84, 760);
      const ctaH = 68;

      const ctaPulse = 1.0 + Math.sin(currentTime * 4.5) * 0.032;

      ctx.save();
      ctx.translate(w / 2, ctaY + ctaH / 2);
      ctx.scale(ctaPulse, ctaPulse);

      const ctaGrad = ctx.createLinearGradient(-ctaW / 2, 0, ctaW / 2, 0);
      ctaGrad.addColorStop(0, pal.primary);
      ctaGrad.addColorStop(1, pal.secondary);

      ctx.fillStyle = ctaGrad;
      ctx.shadowColor = pal.primary;
      ctx.shadowBlur = 24 + energy * 16;
      ctx.beginPath();
      ctx.roundRect(-ctaW / 2, -ctaH / 2, ctaW, ctaH, ctaH / 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '800 24px Montserrat, Inter, sans-serif';
      ctx.fillStyle = '#06080d';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'transparent';
      ctx.fillText(`⚡ ${ctaText} →`, 0, 0);

      ctx.restore();
    }

    ctx.restore();
  }

  _drawThumbnailTitle(ctx, w, h, titleText, badgeText = 'OFFICIAL VIDEO') {
    ctx.save();

    const scrim = ctx.createLinearGradient(0, h * 0.45, 0, h);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(0.5, 'rgba(6,8,13,0.75)');
    scrim.addColorStop(1, 'rgba(6,8,13,0.95)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);

    if (badgeText) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = '900 20px Montserrat, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const bW = ctx.measureText(badgeText).width + 36;
      ctx.fillRect((w - bW) / 2, h * 0.68, bW, 40);

      ctx.fillStyle = '#06080d';
      ctx.fillText(badgeText, w / 2, h * 0.68 + 20);
    }

    const fontSize = Math.min(68, Math.floor(w / 18));
    ctx.font = `900 ${fontSize}px Montserrat, Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeText(titleText.toUpperCase(), w / 2, h * 0.82);
    ctx.fillText(titleText.toUpperCase(), w / 2, h * 0.82);

    ctx.restore();
  }

  async exportThumbnail(format = '16:9', options = {}) {
    const offCanvas = document.createElement('canvas');
    if (format === '16:9') {
      offCanvas.width = 1280;
      offCanvas.height = 720;
    } else if (format === '9:16') {
      offCanvas.width = 1080;
      offCanvas.height = 1920;
    } else {
      offCanvas.width = 1080;
      offCanvas.height = 1080;
    }

    const offCtx = offCanvas.getContext('2d');
    const oldCanvas = this.canvas;
    const oldCtx = this.ctx;
    const oldRatio = this.aspectRatio;

    this.canvas = offCanvas;
    this.ctx = offCtx;
    this.aspectRatio = format;

    const fakeFreq = new Uint8Array(64).fill(160);
    this.drawFrame(fakeFreq, this.currentTime || 5, this.totalDuration || 60);

    if (options.title) {
      this._drawThumbnailTitle(offCtx, offCanvas.width, offCanvas.height, options.title, options.badge);
    }

    this.canvas = oldCanvas;
    this.ctx = oldCtx;
    this.aspectRatio = oldRatio;

    return offCanvas.toDataURL('image/png');
  }

  stop() {
    if (this._exportOperation) this._exportOperation.cancelled = true;
    this.isRecording = false;
    this.isPreviewing = false;
    this.previewStartAudioTime = null;
    this.previewStartOffset = 0;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (e) {}
    }
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch (e) {}
      try { this.sourceNode.disconnect(); } catch (e) {}
      this.sourceNode = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
