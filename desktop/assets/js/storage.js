/**
 * Suno Downloader Pro - Storage & Cache Manager
 * Manages song history, metadata caching, and in-memory audio buffers
 */

export class StorageManager {
  static STORAGE_KEY = 'suno_downloader_pro_v1';

  // In-memory cache for decrypted audio buffers to prevent redundant network fetches
  static _bufferCache = new Map(); // uuid -> { decryptedBuffer, audioBuffer, stems }

  static safeUrl(value, image = false) {
    if (typeof value !== 'string') return '';
    if (image && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)) return value;
    try {
      const url = new URL(value, typeof location !== 'undefined' ? location.href : 'http://localhost/');
      return ['https:', 'http:', 'blob:'].includes(url.protocol) ? value : '';
    } catch { return ''; }
  }

  static normalizeSong(item) {
    if (!item || typeof item !== 'object' || typeof item.uuid !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(item.uuid)) return null;
    const song = { ...item, uuid: item.uuid.toLowerCase() };
    for (const key of ['title','artist','album','tags','prompt','customLyrics','platform','model']) {
      if (song[key] !== undefined) song[key] = typeof song[key] === 'string' ? song[key] : '';
    }
    for (const key of ['imageLarge','imageUrl','image_url','thumbnail','streamUrl','audioUrl','videoUrl','url','sourceUrl']) {
      if (song[key] !== undefined) song[key] = this.safeUrl(song[key], /image|thumbnail/i.test(key));
    }
    if (song.duration !== undefined) song.duration = Math.max(0, Number(song.duration) || 0);
    return song;
  }

  /**
   * Loads saved songs from LocalStorage
   * @returns {Array<Object>}
   */
  static loadSongs() {
    try {
      const data = localStorage.getItem(StorageManager.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed.map(item => StorageManager.normalizeSong(item)).filter(Boolean);
      }
    } catch (e) {
      console.warn('Could not parse saved songs from localStorage', e);
    }
    return [];
  }

  /**
   * Persists songs array to LocalStorage
   * @param {Array<Object>} songs
   */
  static saveSongs(songs) {
    try {
      localStorage.setItem(StorageManager.STORAGE_KEY, JSON.stringify(songs.map(item => StorageManager.normalizeSong(item)).filter(Boolean)));
    } catch (e) {
      console.warn('Could not save songs to localStorage', e);
    }
  }

  /**
   * Adds or updates a song in LocalStorage
   * @param {Object} song
   */
  static upsertSong(song) {
    song = StorageManager.normalizeSong(song);
    if (!song) throw new Error('Invalid song record.');
    const songs = StorageManager.loadSongs();
    const existingIdx = songs.findIndex(s => s.uuid === song.uuid);
    if (existingIdx !== -1) {
      songs[existingIdx] = { ...songs[existingIdx], ...song };
    } else {
      songs.unshift(song);
    }
    StorageManager.saveSongs(songs);
  }

  /**
   * Removes a song by UUID
   * @param {string} uuid
   */
  static removeSong(uuid) {
    const cleanId = uuid.toLowerCase().trim();
    const songs = StorageManager.loadSongs().filter(s => s.uuid !== cleanId);
    StorageManager.saveSongs(songs);
    StorageManager._bufferCache.delete(cleanId);
  }

  /**
   * Clears all saved songs
   */
  static clearAll() {
    try {
      localStorage.removeItem(StorageManager.STORAGE_KEY);
    } catch (e) {}
    StorageManager._bufferCache.clear();
  }

  /**
   * Memory buffer cache helpers
   */
  static setCachedBuffer(uuid, data) {
    const key = uuid.toLowerCase().trim();
    StorageManager._bufferCache.delete(key);
    while (StorageManager._bufferCache.size >= 3) StorageManager._bufferCache.delete(StorageManager._bufferCache.keys().next().value);
    StorageManager._bufferCache.set(key, data);
  }

  static getCachedBuffer(uuid) {
    return StorageManager._bufferCache.get(uuid.toLowerCase().trim()) || null;
  }

  /**
   * Exports playlist as JSON
   * @returns {string}
   */
  static exportPlaylist() {
    const songs = StorageManager.loadSongs();
    return JSON.stringify(songs, null, 2);
  }

  /**
   * Imports playlist from JSON string
   * @param {string} jsonStr
   * @returns {number} Count of imported songs
   */
  static importPlaylist(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('Invalid playlist format');
    const existing = StorageManager.loadSongs();
    const existingIds = new Set(existing.map(s => s.uuid));

    let count = 0;
    parsed.forEach(raw => {
      const item = StorageManager.normalizeSong(raw);
      if (item && item.uuid && !existingIds.has(item.uuid)) {
        existing.push(item);
        existingIds.add(item.uuid);
        count++;
      }
    });

    StorageManager.saveSongs(existing);
    return count;
  }
}
