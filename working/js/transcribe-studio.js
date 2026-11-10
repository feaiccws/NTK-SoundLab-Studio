import { TranscribeMedia, TRANSCRIBE_LIMITS, fingerprint, chunkWindow, transcriptCues, transcribeSection, exportTranscript } from './transcribe-engine.js?v=2026.11.3.1';
import { TranscriptStore } from './transcript-store.js?v=2026.11.3.1';
import { VaultDB } from './vault-db.js?v=2026.11.3.1';

export class TranscribeStudio {
  constructor(app) {
    this.app = app; this.record = null; this.file = null; this.busy = false; this.saveQueue = Promise.resolve();
    this.$ = id => document.getElementById('transcribe' + id);
    this.$('File').onchange = () => { const file = this.$('File').files[0]; if (file) this.selectFile(file); this.$('File').value = ''; };
    this.$('Start').onclick = () => this.run();
    this.$('Cancel').onclick = () => this.cancel();
    this.$('Text').oninput = () => { if (!this.record) return; this.record.text = this.$('Text').value; this.queueSave().catch(() => {}); this.renderDownloads(); };
    this.$('Title').oninput = () => { if (!this.record) return; this.record.title = this.$('Title').value; this.queueSave().catch(() => {}); };
    this.$('Save').onclick = () => this.queueSave().catch(() => {});
    this.$('New').onclick = async () => { if (this.busy) return; await this.saveQueue; if (this.unsaved) { this.status('Save or download your unsaved edits before starting another transcript.'); return; } this.record = null; this.releaseFile(); this.render(); this.status('Choose a recording to begin.'); this.$('File').click(); };
    this.$('Copy').onclick = async () => { try { await navigator.clipboard.writeText(this.$('Text').value); this.status('Transcript copied.'); } catch { this.$('Text').focus(); this.$('Text').select(); this.status('Text selected. Use your device’s Copy command.'); } };
    for (const format of ['txt', 'srt', 'lrc']) this.$(format.toUpperCase()).onclick = () => this.download(format);
    this.$('History').onchange = async () => {
      if (this.busy || !this.$('History').value) return;
      await this.saveQueue;
      if (this.unsaved) { this.$('History').value = this.record?.id || ''; this.status('Save or download your unsaved edits before opening another transcript.'); return; }
      try { const records = await TranscriptStore.list(); this.record = records.find(r => r.id === this.$('History').value) || null; this.releaseFile(); this.render(); this.status(this.record?.status === 'complete' ? 'Saved transcript opened. You can edit and download offline.' : 'Partial transcript opened. Choose the same source file to continue.'); } catch (e) { this.status(e.message); }
    };
    this.$('Delete').onclick = async () => {
      if (this.busy || !this.record || !confirm('Delete this transcript from this device? Downloaded copies will remain.')) return;
      const id = this.record.id;
      try { await this.saveQueue; await TranscriptStore.remove(id); this.record = null; this.releaseFile(); this.render(); await this.history(); this.status('Transcript deleted from this device.'); } catch (e) { this.status(e.message); }
    };
    window.addEventListener('beforeunload', event => { if (this.busy || this.unsaved) { event.preventDefault(); event.returnValue = ''; } });
    this.$('Modal').addEventListener('keydown', event => {
      if (event.key !== 'Tab' || [...document.querySelectorAll('.modal-overlay.open')].at(-1) !== this.$('Modal')) return;
      const items = [...this.$('Modal').querySelectorAll('button,input,select,textarea,a[href],audio')].filter(el => !el.disabled && el.getClientRects().length);
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    });
    this.render();
  }
  open() {
    this.app.player.pause(); this.app.stopAllModalAudio(); this.previousFocus = document.activeElement;
    this.$('Modal').classList.add('open'); this.history(); this.$('Modal').querySelector('[data-close-modal]').focus(); this.$('Modal').querySelector('.transcribe-content').scrollTop = 0;
  }
  status(text) { this.$('Status').textContent = text; }
  releaseFile() { this.file = null; if (this.previewURL) URL.revokeObjectURL(this.previewURL); this.previewURL = null; this.$('Preview').removeAttribute('src'); this.$('Preview').load(); }
  cancel() { this.controller?.abort(); this.$('Preview').pause(); }
  closed() { if (!this.$('Modal').classList.contains('open')) { this.cancel(); if (this.previousFocus?.isConnected) this.previousFocus.focus(); } }
  async selectFile(file) {
    if (this.busy) return;
    this.busy = true; const controller = this.controller = new AbortController(); this.render(); this.status('Checking recording…');
    let media;
    try {
      media = await TranscribeMedia.open(file, controller.signal);
      const identity = await fingerprint(file); controller.signal.throwIfAborted();
      await this.saveQueue;
      if (this.unsaved) throw new Error('Save or download your unsaved edits before choosing another recording.');
      const resume = this.record && this.record.source === identity && this.record.status !== 'complete';
      this.releaseFile(); this.file = file;
      this.previewURL = URL.createObjectURL(file); this.$('Preview').src = this.previewURL;
      if (!resume) this.record = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), source: identity, sourceName: file.name, bytes: file.size, duration: media.duration, cues: [], text: '', completed: 0, status: 'ready', language: '', detectedLanguage: '', model: 'whisper-large-v3-turbo', updatedAt: Date.now() };
      this.status(resume ? 'Same recording selected. Continue from the unfinished section when ready.' : 'Ready. Confirm the upload below, then start transcription.');
    } catch (error) { this.status(controller.signal.aborted ? 'File check cancelled.' : error.message); }
    finally { media?.dispose(); this.controller = null; this.busy = false; this.render(); }
  }
  renderDownloads() {
    const hasText = !!this.record?.text.trim();
    for (const name of ['TXT', 'Copy']) this.$(name).disabled = !hasText;
    const timed = hasText && this.record.cues.length > 0 && this.record.text.split('\n').length === this.record.cues.length;
    this.$('SRT').disabled = this.$('LRC').disabled = !timed;
    this.$('TimingHint').textContent = hasText && !timed ? 'TXT is ready. Timed downloads need the original number of text lines.' : 'Keep one line per cue to retain timings in SRT and LRC. Review recognition, especially singing and names.';
  }
  render() {
    const r = this.record;
    for (const name of ['File', 'New', 'History', 'Language', 'Model', 'Consent']) this.$(name).disabled = this.busy;
    for (const name of ['Text', 'Title', 'Save', 'Delete']) this.$(name).disabled = this.busy || !r;
    this.$('Language').disabled ||= !!r?.completed;
    this.$('Model').disabled ||= !!r?.completed;
    this.$('Start').disabled = this.busy || !this.file || r?.status === 'complete';
    this.$('Start').textContent = r?.status === 'complete' ? 'Transcription complete' : r?.completed ? 'Continue unfinished sections' : 'Start transcription';
    this.$('Preview').hidden = !this.file;
    this.$('Cancel').disabled = !this.busy;
    this.$('Title').value = r?.title || ''; this.$('Text').value = r?.text || '';
    this.$('FileInfo').textContent = r ? `${r.sourceName} · ${(r.bytes / 1000000).toFixed(1)} MB · ${Math.floor(r.duration / 60)}:${String(Math.round(r.duration % 60)).padStart(2, '0')} · ${r.status}${r.detectedLanguage ? ' · ' + r.detectedLanguage : ''}` : 'Audio or video · up to 1 hour AND 150 MB per file';
    this.$('Progress').value = r ? r.completed / Math.ceil(r.duration / TRANSCRIBE_LIMITS.chunk) : 0;
    if (r?.completed) { this.$('Language').value = r.language; this.$('Model').value = r.model; }
    this.renderDownloads();
  }
  queueSave() {
    if (!this.record) return Promise.resolve();
    this.record.updatedAt = Date.now(); const snapshot = structuredClone(this.record); this.unsaved = true;
    const write = this.saveQueue.then(() => TranscriptStore.save(snapshot));
    this.saveQueue = write.then(() => { if (this.record?.updatedAt === snapshot.updatedAt) { this.unsaved = false; this.$('SaveStatus').textContent = 'Saved on this device'; } }, error => { this.$('SaveStatus').textContent = error.message; });
    // Callers processing audio stop on failed persistence. Editing remains available for download.
    return write;
  }
  async history() {
    try {
      const records = await TranscriptStore.list(), select = this.$('History'); select.replaceChildren(new Option('Open a saved transcript…', ''));
      for (const r of records) select.add(new Option(`${r.title || 'Untitled'} — ${r.status}`, r.id));
      if (this.record) select.value = this.record.id;
    } catch (e) { this.$('SaveStatus').textContent = e.message; }
  }
  async run() {
    if (this.busy || !this.file || !this.record || this.record.status === 'complete') return;
    if (!this.$('Consent').checked) { this.status('Confirm that this is your free account with billing disabled and that you agree to upload this recording to Groq.'); return; }
    this.busy = true; const controller = this.controller = new AbortController(), record = this.record;
    record.language = this.$('Language').value; record.model = this.$('Model').value; record.status = 'processing';
    this.$('Preview').pause(); this.render(); let media;
    try {
      const key = await VaultDB.readSetting('groq_api_key', '');
      if (!key) throw new Error('Add your Groq key in AI Keys, then return here.');
      media = await TranscribeMedia.open(this.file, controller.signal);
      const total = Math.ceil(record.duration / TRANSCRIBE_LIMITS.chunk);
      while (record.completed < total) {
        controller.signal.throwIfAborted();
        const index = record.completed, window = chunkWindow(index, record.duration);
        this.status(`Preparing section ${index + 1} of ${total}…`);
        const blob = await media.wav(window.start, window.end, controller.signal, pct => this.status(`Preparing section ${index + 1} of ${total} · ${Math.round(pct * 100)}%`));
        this.status(`Transcribing section ${index + 1} of ${total}… Keep the app open.`);
        const result = await transcribeSection(blob, { key, model: record.model, language: record.language, signal: controller.signal });
        controller.signal.throwIfAborted();
        const cues = transcriptCues(result, window, record.duration);
        record.cues.push(...cues);
        if (cues.length) record.text += (record.text ? '\n' : '') + cues.map(c => c.text).join('\n');
        record.detectedLanguage = String(result.language || record.detectedLanguage).slice(0, 80);
        record.completed++; record.status = record.completed === total ? 'complete' : 'partial';
        await this.queueSave(); this.render();
      }
      this.status(record.text ? 'Transcription complete. Review, edit, then download your text.' : 'Finished. No speech or singing was detected. You can enter text manually.');
    } catch (error) {
      if (record.status !== 'complete') record.status = 'partial';
      this.status(controller.signal.aborted ? 'Cancelled. Completed sections are kept. Continue when ready.' : `${error.message} Completed sections are kept; retry only when ready.`);
      await this.queueSave().catch(() => {});
    } finally { media?.dispose(); this.controller = null; this.busy = false; this.render(); this.history(); }
  }
  download(format) {
    try {
      const text = exportTranscript(this.record, format);
      const name = (this.record.title || 'Transcript').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
      this.app.triggerDownload(new Blob([text + '\n'], { type: format === 'srt' ? 'application/x-subrip;charset=utf-8' : 'text/plain;charset=utf-8' }), `${name}.${format}`);
      this.status(`${format.toUpperCase()} download prepared${this.record.status === 'complete' ? '.' : ' (partial transcript).'}`);
    } catch (error) { this.status(error.message); }
  }
}
