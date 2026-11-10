/**
 * Suno Downloader Pro - High-Precision Interactive Image Cropper
 * Pure vanilla HTML5 Canvas implementation with zero external dependencies.
 * Supports Freeform, 1:1 Square, 16:9 Landscape, 9:16 Story, 4:3, Zoom, Rotation & Flip.
 */

export class ImageCropper {
  constructor() {
    this.modal = null;
    this.canvas = null;
    this.ctx = null;
    this.image = null;

    this.originalWidth = 0;
    this.originalHeight = 0;

    // Viewport display transform
    this.scale = 1.0;
    this.minScale = 0.2;
    this.maxScale = 4.0;
    this.rotation = 0; // 0, 90, 180, 270
    this.flipH = false;
    this.flipV = false;

    // Crop box in canvas display space: { x, y, width, height }
    this.cropBox = { x: 50, y: 50, width: 200, height: 200 };
    this.activeRatio = 'free'; // 'free' | '1:1' | '16:9' | '9:16' | '4:3'

    // Interaction state
    this.dragMode = null; // null | 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w'
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.cropBoxStart = null;

    this.onApplyCallback = null;
    this.onCancelCallback = null;

    this.imgDrawRect = { x: 0, y: 0, width: 0, height: 0 };
    this.init();
  }

  init() {
    // Bind DOM elements when ready
    this.modal = document.getElementById('imageCropModal');
    this.canvas = document.getElementById('cropCanvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.attachEventListeners();
    }
  }

  attachEventListeners() {
    if (!this.canvas) return;

    const getPointerPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * (this.canvas.width / rect.width),
        y: (clientY - rect.top) * (this.canvas.height / rect.height)
      };
    };

    const handlePointerDown = (e) => {
      e.preventDefault();
      const pos = getPointerPos(e);
      const hit = this.hitTest(pos.x, pos.y);
      if (hit) {
        this.dragMode = hit;
        this.dragStartX = pos.x;
        this.dragStartY = pos.y;
        this.cropBoxStart = { ...this.cropBox };
      }
    };

    const handlePointerMove = (e) => {
      const pos = getPointerPos(e);
      if (!this.dragMode) {
        const hit = this.hitTest(pos.x, pos.y);
        this.updateCursor(hit);
        return;
      }
      e.preventDefault();
      this.handleDrag(pos.x, pos.y);
      this.render();
    };

    const handlePointerUp = () => {
      this.dragMode = null;
      this.cropBoxStart = null;
    };

    this.canvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    this.canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      this.setZoom(this.scale + delta);
    }, { passive: false });
  }

  updateCursor(hit) {
    if (!this.canvas) return;
    const cursors = {
      move: 'move',
      nw: 'nwse-resize',
      se: 'nwse-resize',
      ne: 'nesw-resize',
      sw: 'nesw-resize',
      n: 'ns-resize',
      s: 'ns-resize',
      e: 'ew-resize',
      w: 'ew-resize'
    };
    this.canvas.style.cursor = cursors[hit] || 'default';
  }

  hitTest(px, py) {
    const handleSize = 16;
    const { x, y, width: w, height: h } = this.cropBox;

    // Check 4 corner handles
    if (Math.hypot(px - x, py - y) <= handleSize) return 'nw';
    if (Math.hypot(px - (x + w), py - y) <= handleSize) return 'ne';
    if (Math.hypot(px - (x + w), py - (y + h)) <= handleSize) return 'se';
    if (Math.hypot(px - x, py - (y + h)) <= handleSize) return 'sw';

    // Check edge handles
    if (this.activeRatio === 'free') {
      if (Math.abs(py - y) <= handleSize && px >= x && px <= x + w) return 'n';
      if (Math.abs(py - (y + h)) <= handleSize && px >= x && px <= x + w) return 's';
      if (Math.abs(px - x) <= handleSize && py >= y && py <= y + h) return 'w';
      if (Math.abs(px - (x + w)) <= handleSize && py >= y && py <= y + h) return 'e';
    }

    // Inside box
    if (px >= x && px <= x + w && py >= y && py <= y + h) {
      return 'move';
    }

    return null;
  }

  handleDrag(currentX, currentY) {
    const dx = currentX - this.dragStartX;
    const dy = currentY - this.dragStartY;
    const start = this.cropBoxStart;
    if (!start) return;

    const minW = 40;
    const minH = 40;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    const ratioVal = this.getNumericRatio();

    if (this.dragMode === 'move') {
      let newX = start.x + dx;
      let newY = start.y + dy;
      newX = Math.max(0, Math.min(cw - start.width, newX));
      newY = Math.max(0, Math.min(ch - start.height, newY));
      this.cropBox.x = newX;
      this.cropBox.y = newY;
      return;
    }

    let newX = start.x;
    let newY = start.y;
    let newW = start.width;
    let newH = start.height;

    if (this.dragMode.includes('e')) {
      newW = Math.max(minW, Math.min(cw - start.x, start.width + dx));
    }
    if (this.dragMode.includes('s')) {
      newH = Math.max(minH, Math.min(ch - start.y, start.height + dy));
    }
    if (this.dragMode.includes('w')) {
      const maxDelta = start.width - minW;
      const appliedDx = Math.max(-start.x, Math.min(maxDelta, dx));
      newX = start.x + appliedDx;
      newW = start.width - appliedDx;
    }
    if (this.dragMode.includes('n')) {
      const maxDelta = start.height - minH;
      const appliedDy = Math.max(-start.y, Math.min(maxDelta, dy));
      newY = start.y + appliedDy;
      newH = start.height - appliedDy;
    }

    if (ratioVal) {
      // Maintain fixed aspect ratio
      if (this.dragMode === 'se' || this.dragMode === 'e' || this.dragMode === 's') {
        newH = newW / ratioVal;
        if (newY + newH > ch) {
          newH = ch - newY;
          newW = newH * ratioVal;
        }
      } else if (this.dragMode === 'ne') {
        newH = newW / ratioVal;
        newY = start.y + (start.height - newH);
        if (newY < 0) {
          newY = 0;
          newH = start.y + start.height;
          newW = newH * ratioVal;
        }
      } else if (this.dragMode === 'sw') {
        newH = newW / ratioVal;
        if (newY + newH > ch) {
          newH = ch - newY;
          newW = newH * ratioVal;
          newX = start.x + (start.width - newW);
        }
      } else if (this.dragMode === 'nw') {
        newH = newW / ratioVal;
        newY = start.y + (start.height - newH);
        if (newY < 0) {
          newY = 0;
          newH = start.y + start.height;
          newW = newH * ratioVal;
          newX = start.x + (start.width - newW);
        }
      }
    }

    this.cropBox.x = Math.max(0, Math.min(cw - minW, newX));
    this.cropBox.y = Math.max(0, Math.min(ch - minH, newY));
    this.cropBox.width = Math.min(cw - this.cropBox.x, newW);
    this.cropBox.height = Math.min(ch - this.cropBox.y, newH);

    this.updateDimensionsBadge();
  }

  getNumericRatio() {
    switch (this.activeRatio) {
      case '1:1': return 1.0;
      case '16:9': return 16 / 9;
      case '9:16': return 9 / 16;
      case '4:3': return 4 / 3;
      default: return null;
    }
  }

  setAspectRatio(ratio) {
    this.activeRatio = ratio;

    // Update ratio buttons UI
    const container = document.getElementById('cropRatioButtons');
    if (container) {
      container.querySelectorAll('.crop-ratio-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.ratio === ratio);
      });
    }

    const r = this.getNumericRatio();
    if (r) {
      // Adjust current cropBox to match ratio, fitting in canvas
      let w = this.cropBox.width;
      let h = w / r;
      if (this.cropBox.y + h > this.canvas.height) {
        h = this.canvas.height - this.cropBox.y;
        w = h * r;
      }
      this.cropBox.width = Math.max(40, w);
      this.cropBox.height = Math.max(40, h);
    }

    this.render();
    this.updateDimensionsBadge();
  }

  setZoom(val) {
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, val));
    const zoomInput = document.getElementById('cropZoomRange');
    const zoomVal = document.getElementById('cropZoomValue');
    if (zoomInput) zoomInput.value = Math.round(this.scale * 100);
    if (zoomVal) zoomVal.textContent = `${Math.round(this.scale * 100)}%`;
    this.render();
  }

  rotate(deltaDeg = 90) {
    this.rotation = (this.rotation + deltaDeg + 360) % 360;
    this.render();
  }

  flip(horizontal = true) {
    if (horizontal) {
      this.flipH = !this.flipH;
    } else {
      this.flipV = !this.flipV;
    }
    this.render();
  }

  resetTransforms() {
    this.scale = 1.0;
    this.rotation = 0;
    this.flipH = false;
    this.flipV = false;
    this.centerCropBox();
    this.setZoom(1.0);
    this.render();
  }

  centerCropBox() {
    if (!this.canvas) return;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const r = this.getNumericRatio() || 1.0;

    let w = cw * 0.75;
    let h = w / r;
    if (h > ch * 0.75) {
      h = ch * 0.75;
      w = h * r;
    }

    this.cropBox = {
      x: (cw - w) / 2,
      y: (ch - h) / 2,
      width: w,
      height: h
    };
    this.updateDimensionsBadge();
  }

  updateDimensionsBadge() {
    const badge = document.getElementById('cropDimensionsBadge');
    if (!badge || !this.image) return;

    // Calculate source image crop resolution
    const sourceCrop = this.computeSourceCropRect();
    badge.textContent = `${Math.round(sourceCrop.width)} × ${Math.round(sourceCrop.height)} px`;
  }

  /**
   * Loads an image and displays the Cropper modal
   * Supports either open({ imageSource, targetType, aspectRatio, title, onApply, onCancel })
   * or open(imageSource, { targetType, aspectRatio, title, onApply, onCancel })
   */
  async open(sourceOrOptions, maybeOptions = {}) {
    let imageSource, targetType, aspectRatio, title, onApply, onCancel;

    if (sourceOrOptions && typeof sourceOrOptions === 'object' && !(sourceOrOptions instanceof Blob) && !(sourceOrOptions instanceof File)) {
      ({ imageSource, targetType = 'thumbnail', aspectRatio = 'free', title = 'Crop Image', onApply, onCancel } = sourceOrOptions);
    } else {
      imageSource = sourceOrOptions;
      ({ targetType = 'thumbnail', aspectRatio = 'free', title = 'Crop Image', onApply, onCancel } = maybeOptions);
    }

    this.init();
    this.onApplyCallback = onApply;
    this.onCancelCallback = onCancel;

    const titleEl = document.getElementById('cropModalTitle');
    if (titleEl) titleEl.textContent = title;

    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load image for cropping.'));
      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else if (imageSource instanceof Blob || imageSource instanceof File) {
        img.src = URL.createObjectURL(imageSource);
      } else {
        reject(new Error('Invalid image source.'));
      }
    });

    this.image = img;
    this.originalWidth = img.naturalWidth || img.width;
    this.originalHeight = img.naturalHeight || img.height;

    // Reset transforms
    this.scale = 1.0;
    this.rotation = 0;
    this.flipH = false;
    this.flipV = false;

    // Adjust canvas resolution according to modal size
    this.canvas.width = 680;
    this.canvas.height = 460;

    // Initial aspect ratio selection based on target type
    let defaultRatio = aspectRatio;
    if (aspectRatio === 'free') {
      if (targetType === 'thumbnail' || targetType === 'cover') defaultRatio = '1:1';
      else if (targetType === 'backdrop_landscape') defaultRatio = '16:9';
      else if (targetType === 'backdrop_vertical') defaultRatio = '9:16';
    }
    this.setAspectRatio(defaultRatio);
    this.centerCropBox();

    // Show modal
    if (this.modal) {
      this.modal.classList.add('open');
    }

    this.render();
  }

  close() {
    if (this.modal) {
      this.modal.classList.remove('open');
    }
    this.image = null;
  }

  computeSourceCropRect() {
    if (!this.image || !this.canvas) return { x: 0, y: 0, width: 1, height: 1 };

    // Find the rendered position of the image on the canvas
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const iw = this.originalWidth;
    const ih = this.originalHeight;

    // Base fitted size
    const fitRatio = Math.min((cw * 0.9) / iw, (ch * 0.9) / ih) * this.scale;
    const baseW = iw * fitRatio;
    const baseH = ih * fitRatio;

    const imgCenterX = cw / 2;
    const imgCenterY = ch / 2;

    const imgLeft = imgCenterX - baseW / 2;
    const imgTop = imgCenterY - baseH / 2;

    // Relative to fitted image
    const relX = (this.cropBox.x - imgLeft) / baseW;
    const relY = (this.cropBox.y - imgTop) / baseH;
    const relW = this.cropBox.width / baseW;
    const relH = this.cropBox.height / baseH;

    const sourceX = Math.max(0, Math.min(iw, relX * iw));
    const sourceY = Math.max(0, Math.min(ih, relY * ih));
    const sourceW = Math.max(1, Math.min(iw - sourceX, relW * iw));
    const sourceH = Math.max(1, Math.min(ih - sourceY, relH * ih));

    return {
      x: sourceX,
      y: sourceY,
      width: sourceW,
      height: sourceH
    };
  }

  render() {
    if (!this.ctx || !this.canvas || !this.image) return;
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    ctx.clearRect(0, 0, cw, ch);

    // Draw background grid
    this.drawCheckerboard(ctx, cw, ch);

    // Draw transformed image
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1);

    const fitRatio = Math.min((cw * 0.9) / this.originalWidth, (ch * 0.9) / this.originalHeight) * this.scale;
    const drawW = this.originalWidth * fitRatio;
    const drawH = this.originalHeight * fitRatio;

    ctx.drawImage(this.image, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Darken outer region
    this.drawDimmedOverlay(ctx, cw, ch);

    // Draw Crop Box & Handles
    this.drawCropBox(ctx);
  }

  drawCheckerboard(ctx, w, h) {
    const size = 16;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#181b24' : '#10131a';
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  drawDimmedOverlay(ctx, cw, ch) {
    const { x, y, width: w, height: h } = this.cropBox;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    // Top
    ctx.fillRect(0, 0, cw, y);
    // Bottom
    ctx.fillRect(0, y + h, cw, ch - (y + h));
    // Left
    ctx.fillRect(0, y, x, h);
    // Right
    ctx.fillRect(x + w, y, cw - (x + w), h);
  }

  drawCropBox(ctx) {
    const { x, y, width: w, height: h } = this.cropBox;

    // Border
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Rule of thirds grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(x + w / 3, y);
    ctx.lineTo(x + w / 3, y + h);
    ctx.moveTo(x + (w * 2) / 3, y);
    ctx.lineTo(x + (w * 2) / 3, y + h);

    ctx.moveTo(x, y + h / 3);
    ctx.lineTo(x + w, y + h / 3);
    ctx.moveTo(x, y + (h * 2) / 3);
    ctx.lineTo(x + w, y + (h * 2) / 3);
    ctx.stroke();

    ctx.setLineDash([]);

    // 4 Corner Handles (L-shaped thick corner grips)
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 4;
    const grip = 16;

    // NW
    ctx.beginPath();
    ctx.moveTo(x, y + grip);
    ctx.lineTo(x, y);
    ctx.lineTo(x + grip, y);
    ctx.stroke();

    // NE
    ctx.beginPath();
    ctx.moveTo(x + w - grip, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + grip);
    ctx.stroke();

    // SE
    ctx.beginPath();
    ctx.moveTo(x + w, y + h - grip);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w - grip, y + h);
    ctx.stroke();

    // SW
    ctx.beginPath();
    ctx.moveTo(x + grip, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + h - grip);
    ctx.stroke();

    // Center circular crosshair for easy dragging
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.8)';
    ctx.fill();
  }

  /**
   * Exports high-resolution cropped image directly from original image data
   */
  async exportCropped({ format = 'image/jpeg', quality = 0.92 } = {}) {
    if (!this.image) throw new Error('No active image to crop.');

    const sourceCrop = this.computeSourceCropRect();
    const outCanvas = document.createElement('canvas');
    outCanvas.width = Math.round(sourceCrop.width);
    outCanvas.height = Math.round(sourceCrop.height);

    const outCtx = outCanvas.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';

    outCtx.drawImage(
      this.image,
      sourceCrop.x,
      sourceCrop.y,
      sourceCrop.width,
      sourceCrop.height,
      0,
      0,
      outCanvas.width,
      outCanvas.height
    );

    const dataUrl = outCanvas.toDataURL(format, quality);
    const blob = await new Promise((res) => outCanvas.toBlob(res, format, quality));

    return {
      dataUrl,
      blob,
      width: outCanvas.width,
      height: outCanvas.height
    };
  }

  async apply() {
    try {
      const result = await this.exportCropped();
      this.close();
      if (typeof this.onApplyCallback === 'function') {
        this.onApplyCallback(result);
      }
    } catch (e) {
      console.error('Failed to apply crop:', e);
    }
  }

  cancel() {
    this.close();
    if (typeof this.onCancelCallback === 'function') {
      this.onCancelCallback();
    }
  }
}

if (typeof window !== 'undefined') {
  window.ImageCropper = ImageCropper;
}

