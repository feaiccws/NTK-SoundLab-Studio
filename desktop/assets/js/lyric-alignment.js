import { LyricsUtils } from './lyrics-utils.js?v=2026.11.3.1';

/**
 * Conservative alignment of supplied lyrics to measured speech-recognition words.
 * Matching normalization never changes displayed words. No timing is interpolated.
 * Full exact normalized coverage and one unambiguous monotonic match are required.
 * This is transcript matching, not an acoustic forced-alignment implementation.
 */
export class LyricAlignment {
  static LIMITS = Object.freeze({ rawCharacters: 200000, lyricWords: 10000, transcriptWords: 20000 });
  static EPSILON = 0.000001;

  static fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  static normalizeToken(token) {
    return token.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  }

  /** Returns display lines; original punctuation and internal whitespace survive. */
  static parseLines(raw) {
    if (typeof raw !== 'string') this.fail('INVALID_LYRICS', 'Lyrics must be text.');
    if (raw.length > this.LIMITS.rawCharacters) this.fail('LYRICS_TOO_LARGE', 'The supplied lyrics are too large to align safely.');
    const lines = [];
    for (const input of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
      // Old timing is not evidence for the newly requested audio alignment.
      let line = input.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '')
        .replace(/<\d{1,3}:\d{2}(?:\.\d{1,3})?>/g, '').trim();
      // Reuse the application's definition of a non-sung standalone directive.
      if (!LyricsUtils.stripPromptTags(line)) continue;
      // Remove inline directives without normalizing the user's display whitespace.
      line = line.replace(/\[[^\]]*\]/g, '').replace(/\{[^}]*\}/g, '').trim();
      if (line) lines.push(line);
    }
    return lines;
  }

  static checkDuration(duration) {
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      this.fail('INVALID_DURATION', 'Audio duration must be a finite positive number.');
    }
  }

  static checkSpan(start, end, duration, label) {
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) ||
        start < 0 || end <= start || end > duration) {
      this.fail('INVALID_TIMESTAMPS', `${label} has invalid or out-of-audio timestamps.`);
    }
  }

  /**
   * All supplied words must match real timestamp records. Extra transcript words
   * are allowed. Earliest and latest complete subsequence matches must agree;
   * otherwise multiple alignments are possible and no choice is presented as exact.
   * This strict algorithm uses O(L + T) memory/time and allocates no L-by-T matrix.
   */
  static align(raw, transcriptWords, duration) {
    this.checkDuration(duration);
    const lines = this.parseLines(raw);
    if (!lines.length) this.fail('NO_LYRICS', 'No sung lyric lines were supplied.');

    const tokens = [];
    const lineTokens = lines.map((line, lineIndex) => {
      const words = line.split(/\s+/);
      for (const text of words) {
        const normalized = this.normalizeToken(text);
        if (!normalized) this.fail('UNSUPPORTED_TOKEN', `Line ${lineIndex + 1} has a standalone punctuation token; join it to the adjacent word before alignment.`);
        tokens.push({ text, normalized, lineIndex });
      }
      return words;
    });
    if (tokens.length > this.LIMITS.lyricWords) this.fail('LYRICS_TOO_LARGE', 'There are too many lyric words to align safely.');
    if (!Array.isArray(transcriptWords) || !transcriptWords.length) {
      this.fail('NO_WORD_TIMESTAMPS', 'The provider returned no measured word timestamps. Your supplied lyrics have been preserved.');
    }
    if (transcriptWords.length > this.LIMITS.transcriptWords) this.fail('TRANSCRIPT_TOO_LARGE', 'There are too many transcript words to align safely.');

    const transcript = [];
    let previousEnd = -Infinity;
    for (let index = 0; index < transcriptWords.length; index++) {
      const item = transcriptWords[index];
      if (!item || typeof item !== 'object') this.fail('INVALID_TRANSCRIPT', `Transcript word ${index + 1} is invalid.`);
      const rawWord = typeof item.word === 'string' ? item.word : item.text;
      if (typeof rawWord !== 'string' || !rawWord.trim() || /\s/.test(rawWord.trim())) {
        this.fail('INVALID_TRANSCRIPT', `Transcript item ${index + 1} must contain one measured word, not a phrase.`);
      }
      this.checkSpan(item.start, item.end, duration, `Transcript word ${index + 1}`);
      if (item.start + this.EPSILON < previousEnd) this.fail('INVALID_TIMESTAMPS', 'Transcript word timestamps overlap or run backwards.');
      previousEnd = item.end;
      const normalized = this.normalizeToken(rawWord.trim());
      // A provider may emit punctuation as a separate timestamped item.
      if (normalized) transcript.push({ normalized, start: item.start, end: item.end });
    }
    if (!transcript.length) this.fail('NO_WORD_TIMESTAMPS', 'The provider returned no sung words with measured timestamps.');

    const earliest = new Int32Array(tokens.length);
    const latest = new Int32Array(tokens.length);
    let cursor = 0;
    for (let i = 0; i < tokens.length; i++) {
      while (cursor < transcript.length && transcript[cursor].normalized !== tokens[i].normalized) cursor++;
      if (cursor === transcript.length) {
        this.fail('WEAK_MATCH', `The measured transcript does not reliably match all supplied lyrics (line ${tokens[i].lineIndex + 1}). Your lyrics have been preserved.`);
      }
      earliest[i] = cursor++;
    }
    cursor = transcript.length - 1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      while (cursor >= 0 && transcript[cursor].normalized !== tokens[i].normalized) cursor--;
      latest[i] = cursor--;
      if (latest[i] !== earliest[i]) {
        this.fail('AMBIGUOUS_MATCH', 'Repeated transcript words allow more than one timing match. Your lyrics have been preserved; review the audio or use manual sync.');
      }
    }

    const cues = [];
    let tokenIndex = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const words = lineTokens[lineIndex].map(text => {
        const measured = transcript[earliest[tokenIndex++]];
        return { text, start: measured.start, end: measured.end };
      });
      cues.push({ text: lines[lineIndex], start: words[0].start, end: words[words.length - 1].end, words });
    }
    this.validateCues(cues, duration, raw);
    return { cues, coverage: 1 };
  }

  /**
   * Returns true or throws. Wordless line cues may be validated separately, but
   * validation alone is not evidence that an AI-generated time matches the audio.
   */
  static validateCues(cues, duration, expectedRaw) {
    this.checkDuration(duration);
    if (!Array.isArray(cues) || !cues.length || cues.length > this.LIMITS.lyricWords) {
      this.fail('INVALID_CUES', 'A bounded, nonempty list of lyric cues is required.');
    }
    const expected = expectedRaw === undefined ? null : this.parseLines(expectedRaw);
    if (expected && expected.length !== cues.length) this.fail('LYRICS_CHANGED', 'Timed output omitted or added supplied lyric lines.');
    let previousEnd = -Infinity;
    let totalWords = 0;
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      if (!cue || typeof cue.text !== 'string' || !cue.text.trim() || /[\r\n]/.test(cue.text)) {
        this.fail('INVALID_CUES', `Cue ${i + 1} must contain one nonempty lyric line.`);
      }
      if (expected && cue.text !== expected[i]) this.fail('LYRICS_CHANGED', `Timed output changed supplied lyric line ${i + 1}.`);
      this.checkSpan(cue.start, cue.end, duration, `Cue ${i + 1}`);
      if (cue.start + this.EPSILON < previousEnd) this.fail('INVALID_TIMESTAMPS', 'Lyric cues overlap or run backwards.');
      previousEnd = cue.end;
      if (cue.words === undefined) continue;
      const displayWords = cue.text.trim().split(/\s+/);
      if (!Array.isArray(cue.words) || !cue.words.length || cue.words.length !== displayWords.length) {
        this.fail('INVALID_CUES', `Cue ${i + 1} does not retain every displayed word.`);
      }
      totalWords += cue.words.length;
      if (totalWords > this.LIMITS.lyricWords) this.fail('LYRICS_TOO_LARGE', 'There are too many timed lyric words.');
      let previousWordEnd = cue.start;
      cue.words.forEach((word, j) => {
        if (!word || word.text !== displayWords[j]) this.fail('LYRICS_CHANGED', `Cue ${i + 1} changed a displayed word.`);
        this.checkSpan(word.start, word.end, duration, `Cue ${i + 1}, word ${j + 1}`);
        if (word.start + this.EPSILON < previousWordEnd || word.end > cue.end || word.start < cue.start) {
          this.fail('INVALID_TIMESTAMPS', `Cue ${i + 1} contains unordered or out-of-cue word timestamps.`);
        }
        previousWordEnd = word.end;
      });
    }
    return true;
  }

  static toLrc(cues) {
    if (!Array.isArray(cues) || !cues.length) this.fail('INVALID_CUES', 'No timed lyric cues are available to export.');
    const duration = cues[cues.length - 1]?.end;
    this.validateCues(cues, duration);
    return cues.map(cue => {
      // Round the total, so a 59.999s start becomes 01:00.00, never 00:60.xx.
      const ticks = Math.round(cue.start * 100);
      const minutes = Math.floor(ticks / 6000);
      const seconds = Math.floor((ticks % 6000) / 100);
      const hundredths = ticks % 100;
      return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}] ${cue.text}`;
    }).join('\n');
  }
}
