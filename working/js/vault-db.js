import { AiPolicy } from './ai-policy.js?v=2026.11.3.1';

/**
 * NTK OmniStream Studio - IndexedDB Universal Offline Vault
 * Persists master audio buffers, 2-stem/4-stem WAV kits, 1080p video blobs,
 * ONNX neural models, and session cookies across reloads.
 */

export class VaultDB {
  static DB_NAME = 'NTKOmniVaultDB';
  static DB_VERSION = 2;
  static _dbPromise = null;

  /**
   * Opens (or returns cached handle to) the IndexedDB database
   * @returns {Promise<IDBDatabase|null>}
   */
  static open() {
    if (VaultDB._dbPromise) return VaultDB._dbPromise;

    VaultDB._dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }

      const req = indexedDB.open(VaultDB.DB_NAME, VaultDB.DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('audio_masters')) {
          db.createObjectStore('audio_masters', { keyPath: 'uuid' });
        }
        if (!db.objectStoreNames.contains('stems_cache')) {
          db.createObjectStore('stems_cache', { keyPath: 'uuid' });
        }
        if (!db.objectStoreNames.contains('video_blobs')) {
          db.createObjectStore('video_blobs', { keyPath: 'uuid' });
        }
        if (!db.objectStoreNames.contains('ai_models')) {
          db.createObjectStore('ai_models', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings_vault')) {
          db.createObjectStore('settings_vault', { keyPath: 'key' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('IndexedDB unavailable; running with in-memory cache only.');
        resolve(null);
      };
    });

    return VaultDB._dbPromise;
  }

  /**
   * Saves master audio ArrayBuffer to IndexedDB
   */
  static async saveMaster(uuid, decryptedBuffer) {
    const db = await VaultDB.open();
    if (!db || !decryptedBuffer) return;

    const cleanId = String(uuid).toLowerCase().trim();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('audio_masters', 'readwrite');
        tx.objectStore('audio_masters').put({
          uuid: cleanId,
          buffer: decryptedBuffer.slice(0),
          byteLength: decryptedBuffer.byteLength,
          updatedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Retrieves master audio ArrayBuffer from IndexedDB
   */
  static async getMaster(uuid) {
    const db = await VaultDB.open();
    if (!db) return null;

    const cleanId = String(uuid).toLowerCase().trim();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('audio_masters', 'readonly');
        const req = tx.objectStore('audio_masters').get(cleanId);
        req.onsuccess = () => resolve(req.result ? req.result.buffer : null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Saves separated stem WAV ArrayBuffers to IndexedDB
   */
  static async saveStems(uuid, stemWavBundle) {
    const db = await VaultDB.open();
    if (!db || !stemWavBundle) return;

    const cleanId = String(uuid).toLowerCase().trim();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('stems_cache', 'readwrite');
        tx.objectStore('stems_cache').put({
          uuid: cleanId,
          vocalsWav: stemWavBundle.vocalsWav ? stemWavBundle.vocalsWav.slice(0) : null,
          leadVocalsWav: stemWavBundle.leadVocalsWav ? stemWavBundle.leadVocalsWav.slice(0) : null,
          backingVocalsWav: stemWavBundle.backingVocalsWav ? stemWavBundle.backingVocalsWav.slice(0) : null,
          instrumentalWav: stemWavBundle.instrumentalWav ? stemWavBundle.instrumentalWav.slice(0) : null,
          drumsWav: stemWavBundle.drumsWav ? stemWavBundle.drumsWav.slice(0) : null,
          bassWav: stemWavBundle.bassWav ? stemWavBundle.bassWav.slice(0) : null,
          otherWav: stemWavBundle.otherWav ? stemWavBundle.otherWav.slice(0) : null,
          engine: stemWavBundle.engine || 'htdemucs-v4',
          updatedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Retrieves separated stems bundle from IndexedDB
   */
  static async getStems(uuid) {
    const db = await VaultDB.open();
    if (!db) return null;

    const cleanId = String(uuid).toLowerCase().trim();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('stems_cache', 'readonly');
        const req = tx.objectStore('stems_cache').get(cleanId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Saves ONNX Neural Model weights into IndexedDB
   */
  static async saveAiModel(modelId, arrayBuf) {
    const db = await VaultDB.open();
    if (!db || !arrayBuf) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('ai_models', 'readwrite');
        tx.objectStore('ai_models').put({
          id: modelId,
          buffer: arrayBuf.slice(0),
          byteLength: arrayBuf.byteLength,
          updatedAt: Date.now()
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  /**
   * Alias for getAiModel for backward compatibility
   */
  static async getModel(modelId) {
    return await VaultDB.getAiModel(modelId);
  }

  /**
   * Alias for saveAiModel for backward compatibility
   */
  static async saveModel(modelId, arrayBuf) {
    return await VaultDB.saveAiModel(modelId, arrayBuf);
  }

  /**
   * Retrieves cached ONNX model weights from IndexedDB
   */
  static async getAiModel(modelId) {
    const db = await VaultDB.open();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('ai_models', 'readonly');
        const req = tx.objectStore('ai_models').get(modelId);
        req.onsuccess = () => resolve(req.result ? req.result.buffer : null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Saves user cookies for private streaming extraction
   */
  static async saveCookies(cookieString) {
    const db = await VaultDB.open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('settings_vault', 'readwrite');
        tx.objectStore('settings_vault').put({ key: 'user_cookies', value: cookieString, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  static async getCookies() {
    const db = await VaultDB.open();
    if (!db) return '';
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('settings_vault', 'readonly');
        const req = tx.objectStore('settings_vault').get('user_cookies');
        req.onsuccess = () => resolve(req.result ? req.result.value : '');
        req.onerror = () => resolve('');
      } catch (e) { resolve(''); }
    });
  }

  // Secrets live in IndexedDB (or session memory if unavailable), never duplicated
  // in localStorage. Legacy copies migrate only after a successful durable write.
  static _sessionSettings = new Map();

  static async writeSetting(key, value) {
    VaultDB._sessionSettings.set(key, value);
    const db = await VaultDB.open();
    if (!db) return false;
    return new Promise(resolve => {
      try {
        const tx = db.transaction('settings_vault', 'readwrite');
        tx.objectStore('settings_vault').put({ key, value, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => resolve(false);
      } catch { resolve(false); }
    });
  }

  static async readSetting(key, fallback) {
    if (VaultDB._sessionSettings.has(key)) return VaultDB._sessionSettings.get(key);
    let legacy = null;
    try { legacy = localStorage.getItem('ntk_' + key); } catch {}
    if (legacy !== null) {
      const value = key === 'ai_general_enabled' ? legacy === 'true' : legacy;
      if (await VaultDB.writeSetting(key, value)) {
        try { localStorage.removeItem('ntk_' + key); } catch {}
      }
      return value;
    }
    const db = await VaultDB.open();
    if (db) {
      const stored = await new Promise(resolve => {
        try {
          const req = db.transaction('settings_vault', 'readonly').objectStore('settings_vault').get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch { resolve(null); }
      });
      if (stored) return stored.value;
    }
    return fallback;
  }

  static async saveProviderKey(provider, value) {
    const saved = await VaultDB.writeSetting(provider + '_api_key', String(value || '').trim());
    // An explicit change/clear supersedes a legacy value even when IDB is unavailable.
    try { localStorage.removeItem('ntk_' + provider + '_api_key'); } catch {}
    return saved;
  }

  static async saveProviderModel(provider, value) {
    return VaultDB.writeSetting(provider + '_model', AiPolicy.normalize(provider, value));
  }

  static async getProviderModel(provider) {
    const saved = await VaultDB.readSetting(provider + '_model', '');
    const normalized = AiPolicy.normalize(provider, saved);
    if (normalized !== saved) await VaultDB.writeSetting(provider + '_model', normalized);
    return normalized;
  }

  static saveOpenRouterKey(key) { return VaultDB.saveProviderKey('openrouter', key); }
  static getOpenRouterKey() { return VaultDB.readSetting('openrouter_api_key', ''); }
  static saveOpenRouterModel(model) { return VaultDB.saveProviderModel('openrouter', model); }
  static getOpenRouterModel() { return VaultDB.getProviderModel('openrouter'); }
  static saveGroqKey(key) { return VaultDB.saveProviderKey('groq', key); }
  static getGroqKey() { return VaultDB.readSetting('groq_api_key', ''); }
  static saveGroqModel(model) { return VaultDB.saveProviderModel('groq', model); }
  static getGroqModel() { return VaultDB.getProviderModel('groq'); }
  static saveGeminiKey(key) { return VaultDB.saveProviderKey('gemini', key); }
  static getGeminiKey() { return VaultDB.readSetting('gemini_api_key', ''); }
  static saveGeminiModel(model) { return VaultDB.saveProviderModel('gemini', model); }
  static getGeminiModel() { return VaultDB.getProviderModel('gemini'); }
  static saveAiProvider(provider) {
    return VaultDB.writeSetting('ai_provider', ['groq', 'gemini', 'openrouter'].includes(provider) ? provider : 'groq');
  }
  static async getAiProvider() {
    const provider = await VaultDB.readSetting('ai_provider', 'groq');
    return ['groq', 'gemini', 'openrouter'].includes(provider) ? provider : 'groq';
  }
  static saveAiGeneralEnabled(enabled) { return VaultDB.writeSetting('ai_general_enabled', !!enabled); }
  static getAiGeneralEnabled() { return VaultDB.readSetting('ai_general_enabled', false); }

  /**
   * Calculates comprehensive storage summary and disk usage
   */
  static async getVaultSummary() {
    const db = await VaultDB.open();
    if (!db) {
      return { masterIds: new Set(), stemIds: new Set(), totalBytes: 0, formattedSize: '0 MB', hasOnnxModel: false };
    }

    const getAll = (storeName) =>
      new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, 'readonly');
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch (e) {
          resolve([]);
        }
      });

    const [masters, stems, models] = await Promise.all([
      getAll('audio_masters'),
      getAll('stems_cache'),
      getAll('ai_models')
    ]);

    let totalBytes = 0;
    masters.forEach((m) => { totalBytes += m.byteLength || (m.buffer ? m.buffer.byteLength : 0); });
    stems.forEach((s) => {
      const b = (s.vocalsWav ? s.vocalsWav.byteLength : 0) +
        (s.instrumentalWav ? s.instrumentalWav.byteLength : 0) +
        (s.drumsWav ? s.drumsWav.byteLength : 0) +
        (s.bassWav ? s.bassWav.byteLength : 0) +
        (s.otherWav ? s.otherWav.byteLength : 0) +
        (s.leadVocalsWav ? s.leadVocalsWav.byteLength : 0) +
        (s.backingVocalsWav ? s.backingVocalsWav.byteLength : 0);
      totalBytes += b;
    });
    models.forEach((m) => { totalBytes += m.byteLength || 0; });

    const mb = totalBytes / 1024 / 1024;
    const formattedSize = mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;

    return {
      masterIds: new Set(masters.map((m) => m.uuid)),
      stemIds: new Set(stems.map((s) => s.uuid)),
      totalBytes,
      formattedSize,
      hasOnnxModel: models.length > 0
    };
  }

  /**
   * Clears a single object store
   */
  static async clearStore(storeName) {
    const db = await VaultDB.open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  /**
   * Completely clears all cached audio, stems, and videos from IndexedDB
   */
  static async clearAll() {
    await Promise.all([
      VaultDB.clearStore('audio_masters'),
      VaultDB.clearStore('stems_cache'),
      VaultDB.clearStore('video_blobs')
    ]);
    return true;
  }
}
