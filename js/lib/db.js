const DB_NAME = 'SkySimulatorDB';
const DB_VERSION = 2; // バージョンを更新

export class DBStorage {
    static async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('appData')) db.createObjectStore('appData');
                if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('sharedCache')) db.createObjectStore('sharedCache');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // --- 汎用操作 ---
    static async get(storeName, key) {
        const db = await this.open();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result);
        });
    }

    static async set(storeName, key, value) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = key !== null ? store.put(value, key) : store.put(value);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // --- セーブ・ロード専用メソッド ---
    static async getAllSaves() {
        const db = await this.open();
        return new Promise((resolve) => {
            const tx = db.transaction('saves', 'readonly');
            const req = tx.objectStore('saves').getAll();
            req.onsuccess = () => resolve(req.result || []);
        });
    }

    static async deleteSave(id) {
        const db = await this.open();
        return new Promise((resolve) => {
            const tx = db.transaction('saves', 'readwrite');
            const req = tx.objectStore('saves').delete(id);
            req.onsuccess = () => resolve();
        });
    }

    static async requestPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
            await navigator.storage.persist();
        }
    }
}