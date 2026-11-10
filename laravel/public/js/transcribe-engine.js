import { Input, BlobSource, AudioSampleSink, MP3, MP4, WAVE, OGG, FLAC, WEBM, MATROSKA, ADTS } from '../lib/mediabunny/mediabunny.js?v=2026.11.3.1';
import { AiPolicy } from './ai-policy.js?v=2026.11.3.1';

export const TRANSCRIBE_LIMITS = Object.freeze({ bytes: 150000000, seconds: 3600, chunk: 240, overlap: 2, rate: 16000 });
const check = signal => { if (signal?.aborted) throw new DOMException('Cancelled. Completed sections are kept.', 'AbortError'); };
export function validateFile(file) {
  if (!file?.size) throw new Error('Choose a non-empty audio or video file.');
  if (file.size > TRANSCRIBE_LIMITS.bytes) throw new Error('This file is larger than 150 MB. Compress or trim it first.');
}
export function validateDuration(duration) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not determine this recording’s duration. Try a WAV or MP3 copy.');
  if (duration > TRANSCRIBE_LIMITS.seconds + 0.001) throw new Error('This recording is longer than 1 hour. Trim it first.');
}
export async function fingerprint(file) {
  validateFile(file);
  const bytes = await new Blob([file.slice(0, 65536), file.slice(Math.max(0, file.size - 65536))]).arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [file.name, file.size, file.lastModified, ...new Uint8Array(hash)].join('-');
}
export class TranscribeMedia {
  static async open(file, signal) {
    validateFile(file); check(signal);
    const input = new Input({ source: new BlobSource(file, { maxCacheSize: 4 * 1024 * 1024 }), formats: [MP3, MP4, WAVE, OGG, FLAC, WEBM, MATROSKA, ADTS] });
    const abort = () => input.dispose();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const duration = await input.computeDuration(); check(signal); validateDuration(duration);
      const track = await input.getPrimaryAudioTrack();
      if (!track) throw new Error('This file has no audio track. Choose a recording with sound.');
      if (!await track.canDecode()) throw new Error('This device cannot decode this audio format. Convert it to PCM WAV, or try MP3 in an up-to-date browser.');
      check(signal);
      return new TranscribeMedia(input, track, duration, () => signal?.removeEventListener('abort', abort));
    } catch (error) { input.dispose(); signal?.removeEventListener('abort', abort); check(signal); throw error; }
  }
  constructor(input, track, duration, cleanup) { Object.assign(this, { input, track, duration, cleanup }); }
  dispose() { this.cleanup(); this.input.dispose(); }
  async wav(start, end, signal, progress = () => {}) {
    check(signal);
    const rate = TRANSCRIBE_LIMITS.rate;
    // One bounded mono window. Area averaging downsamples speech without retaining the full recording.
    const mono = new Float32Array(Math.ceil((end - start) * rate));
    const sink = new AudioSampleSink(this.track);
    let batches = 0, frames = 0;
    for await (const sample of sink.samples(start, end)) {
      try {
        check(signal);
        const count = sample.numberOfFrames, channels = sample.numberOfChannels, sr = sample.sampleRate;
        if (channels > 32 || sr > 384000 || count > sr * 10) throw new Error('This audio layout is too large to decode safely. Try a mono WAV copy.');
        const mixed = new Float32Array(count), plane = new Float32Array(count);
        for (let c = 0; c < channels; c++) {
          sample.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
          for (let i = 0; i < count; i++) mixed[i] += plane[i] / channels;
        }
        const scale = rate / sr, origin = (sample.timestamp - start) * rate;
        for (let i = 0; i < count; i++) {
          const left = origin + i * scale, right = left + scale;
          for (let j = Math.max(0, Math.floor(left)); j < Math.min(mono.length, Math.ceil(right)); j++) {
            mono[j] += mixed[i] * Math.max(0, Math.min(j + 1, right) - Math.max(j, left));
          }
        }
        frames += count;
        if (++batches % 24 === 0) { progress(Math.min(1, (sample.timestamp - start) / (end - start))); await new Promise(r => setTimeout(r, 0)); }
      } finally { sample.close(); }
    }
    check(signal);
    if (!frames) throw new Error('No audio samples could be read in this section. Try a WAV copy.');
    return wavBlob(mono, rate);
  }
}
export function wavBlob(samples, rate = 16000) {
  const bytes = new ArrayBuffer(44 + samples.length * 2), v = new DataView(bytes);
  const tag = (offset, text) => [...text].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i] || 0)); v.setInt16(44 + i * 2, Math.round(x * (x < 0 ? 32768 : 32767)), true); }
  return new Blob([bytes], { type: 'audio/wav' });
}
export function chunkWindow(index, duration) {
  const coreStart = index * TRANSCRIBE_LIMITS.chunk, coreEnd = Math.min(duration, coreStart + TRANSCRIBE_LIMITS.chunk);
  return { coreStart, coreEnd, start: Math.max(0, coreStart - 2), end: Math.min(duration, coreEnd + 2) };
}
export function transcriptCues(data, window, duration) {
  if (!Array.isArray(data.words)) throw new Error('The provider did not return word timestamps. Retry this section.');
  const words = data.words.map(w => ({ text: String(w.word ?? '').trim(), start: Number(w.start) + window.start, end: Number(w.end) + window.start }));
  if (words.some(w => !w.text || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end < w.start || w.start < window.start - 0.2 || w.end > window.end + 1)) throw new Error('The provider returned invalid timestamps. Retry this section.');
  if (!words.length && String(data.text || '').trim()) throw new Error('The provider returned text without timings. Retry this section.');
  // Assign each overlapping word by its midpoint. Repeated choruses remain repeated.
  const owned = words.filter(w => (w.start + w.end) / 2 >= window.coreStart && (w.start + w.end) / 2 < window.coreEnd).sort((a, b) => a.start - b.start);
  const cues = []; let group = [];
  const flush = () => { if (group.length) cues.push({ start: Math.max(window.coreStart, group[0].start), end: Math.min(window.coreEnd, duration, group.at(-1).end), text: group.map(w => w.text).join(' ') }); group = []; };
  for (const word of owned) { if (group.length && (group.length >= 10 || word.start - group.at(-1).end > 0.8 || /[.!?。！？]$/.test(group.at(-1).text))) flush(); group.push(word); }
  flush(); return cues;
}
export async function transcribeSection(blob, { key, model, language, signal }) {
  AiPolicy.assertAllowed('groq', model, true); check(signal);
  if (!blob.size || blob.size > 25000000) throw new Error('The prepared section exceeds the provider upload limit.');
  const body = new FormData();
  body.append('file', blob, 'recording.wav'); body.append('model', model); body.append('response_format', 'verbose_json');
  body.append('timestamp_granularities[]', 'word'); body.append('timestamp_granularities[]', 'segment'); body.append('temperature', '0');
  if (language) body.append('language', language);
  return AiPolicy.request('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body, signal }, 180000);
}
export function exportTranscript(record, format) {
  if (format === 'txt') return record.text;
  const lines = record.text.split('\n');
  if (!record.cues.length || lines.length !== record.cues.length) throw new Error('Timed downloads need one text line per original cue. Restore the line breaks or download TXT.');
  const stamp = (seconds, srt) => {
    const n = Math.max(0, Math.round(seconds * (srt ? 1000 : 100)));
    if (!srt) return `${String(Math.floor(n / 6000)).padStart(2, '0')}:${String(Math.floor(n / 100) % 60).padStart(2, '0')}.${String(n % 100).padStart(2, '0')}`;
    return `${String(Math.floor(n / 3600000)).padStart(2, '0')}:${String(Math.floor(n / 60000) % 60).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')},${String(n % 1000).padStart(3, '0')}`;
  };
  return record.cues.map((cue, i) => format === 'lrc' ? `[${stamp(cue.start, false)}]${lines[i]}` : `${i + 1}\n${stamp(cue.start, true)} --> ${stamp(Math.max(cue.start + 0.01, cue.end), true)}\n${lines[i]}`).join(format === 'lrc' ? '\n' : '\n\n');
}
