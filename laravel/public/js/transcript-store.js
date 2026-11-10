// Separate from media-cache purges: deleting cached songs must not erase transcripts.
export class TranscriptStore {
  static async db() {
    if (!this.connection) this.connection = new Promise((resolve, reject) => {
      const req = indexedDB.open('NTKTranscriptsDB', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('transcripts', { keyPath: 'id' });
      req.onsuccess = () => {
        req.result.onversionchange = () => { req.result.close(); this.connection = null; };
        resolve(req.result);
      };
      req.onerror = () => { this.connection = null; reject(new Error('Local transcript storage is unavailable. Download a copy before closing.')); };
      req.onblocked = () => { this.connection = null; reject(new Error('Close other studio tabs to open transcript history.')); };
    });
    return this.connection;
  }
  static async action(mode, work) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transcripts', mode);
      const request = work(tx.objectStore('transcripts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(new Error('Could not save locally. Storage may be full. Download your transcript now.'));
    });
  }
  static save(record) { return this.action('readwrite', s => s.put(record)); }
  static async list() { return (await this.action('readonly', s => s.getAll())).sort((a, b) => b.updatedAt - a.updatedAt); }
  static remove(id) { return this.action('readwrite', s => s.delete(id)); }
}
