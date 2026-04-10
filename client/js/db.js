export class MidiCamDB {
    constructor(logger) {
        this.logger = logger || console;
        this.dbName = 'MidiCamDB';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                this.logger.info(`Upgrading IndexedDB to version ${this.dbVersion}...`);

                if (!this.db.objectStoreNames.contains('chats')) {
                    const chatStore = this.db.createObjectStore('chats', { keyPath: 'id', autoIncrement: true });
                    chatStore.createIndex('peerId', 'peerId', { unique: false });
                    chatStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!this.db.objectStoreNames.contains('files')) {
                    const fileStore = this.db.createObjectStore('files', { keyPath: 'id' });
                    fileStore.createIndex('peerId', 'peerId', { unique: false });
                    fileStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.logger.info('IndexedDB initialized successfully.');
                resolve();
            };

            request.onerror = (event) => {
                this.logger.error(`IndexedDB initialization failed: ${event.target.error}`);
                reject(event.target.error);
            };
        });
    }

    async addChat(peerId, text, sender) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chats'], 'readwrite');
            const store = transaction.objectStore('chats');
            const request = store.add({
                peerId,
                text,
                sender,
                timestamp: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getChats(peerId) {
        if (!this.db) return [];
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chats'], 'readonly');
            const store = transaction.objectStore('chats');
            const index = store.index('peerId');
            const request = index.getAll(peerId);

            request.onsuccess = (e) => {
                const results = e.target.result.sort((a, b) => a.timestamp - b.timestamp);
                resolve(results);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async clearChats(peerId) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['chats'], 'readwrite');
            const store = transaction.objectStore('chats');
            const index = store.index('peerId');
            const request = index.openCursor(IDBKeyRange.only(peerId));

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // --- FILE METHODS ---

    async addFile(peerId, id, name, type, size, direction, blob) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const request = store.put({
                id,
                peerId,
                name,
                type,
                size,
                direction, // 'local' (sent) or 'remote' (received)
                blob,
                timestamp: Date.now()
            });

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getFiles(peerId) {
        if (!this.db) return [];
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readonly');
            const store = transaction.objectStore('files');
            const index = store.index('peerId');
            const request = index.getAll(peerId);

            request.onsuccess = (e) => {
                const results = e.target.result.sort((a, b) => b.timestamp - a.timestamp); // Newest first
                resolve(results);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async clearFiles(peerId) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const index = store.index('peerId');
            const request = index.openCursor(IDBKeyRange.only(peerId));

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }
}
