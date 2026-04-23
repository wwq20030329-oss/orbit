/**
 * Web-only encrypted credential storage.
 *
 * Why this exists
 * ---------------
 * The previous implementation persisted the authentication credentials
 * (ed25519 seed + bearer token) as plain JSON in `localStorage`. Any XSS
 * on the web origin could exfiltrate them with a one-line payload, which
 * is an unacceptable posture for an end-to-end encrypted product where
 * the seed derives every content encryption key.
 *
 * This module stores the credentials in IndexedDB, encrypted with an
 * AES-GCM key that is generated with `extractable: false`. An attacker
 * with script execution on the page can still call `decrypt()` through
 * this API if they reverse-engineer it, but they cannot directly read
 * the key material out of storage the way `localStorage.getItem(...)`
 * used to allow. Practically this means:
 *
 * - Opportunistic/automated XSS payloads that scrape `localStorage`
 *   will no longer yield usable credentials.
 * - A targeted attacker must run bespoke code in the live tab while
 *   the user is logged in.
 *
 * The module degrades gracefully: if IndexedDB or WebCrypto is not
 * available (very old browsers, ephemeral contexts, some WebView
 * configurations) it returns `null` and `setPlaintext` throws, allowing
 * the caller to decide whether to fall back to another store or abort.
 */

const DB_NAME = 'orbit-secure-auth';
const DB_VERSION = 1;
const STORE_NAME = 'vault';
const KEY_RECORD_ID = 'master-key';
const VALUE_RECORD_ID = 'credentials';

interface EncryptedRecord {
    /** 12-byte AES-GCM IV, stored as an `ArrayBuffer` to sidestep
     *  `Uint8Array<ArrayBufferLike>` variance when round-tripped through
     *  IndexedDB's structured clone. */
    iv: ArrayBuffer;
    ciphertext: ArrayBuffer;
}

function isSupported(): boolean {
    if (typeof globalThis === 'undefined') return false;
    const g = globalThis as unknown as {
        indexedDB?: IDBFactory;
        crypto?: { subtle?: SubtleCrypto };
    };
    return (
        typeof g.indexedDB !== 'undefined' &&
        typeof g.crypto?.subtle !== 'undefined'
    );
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

function idbGet<T>(db: IDBDatabase, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'));
        req.onsuccess = () => resolve(req.result as T | undefined);
    });
}

function idbPut(db: IDBDatabase, key: IDBValidKey, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);
        req.onerror = () => reject(req.error ?? new Error('indexedDB put failed'));
        req.onsuccess = () => resolve();
    });
}

function idbDelete(db: IDBDatabase, key: IDBValidKey): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);
        req.onerror = () => reject(req.error ?? new Error('indexedDB delete failed'));
        req.onsuccess = () => resolve();
    });
}

async function getOrCreateMasterKey(db: IDBDatabase): Promise<CryptoKey> {
    const existing = await idbGet<CryptoKey>(db, KEY_RECORD_ID);
    // IndexedDB preserves CryptoKey objects through the structured clone
    // algorithm. The `extractable` flag is also preserved, so a key that
    // was generated with `extractable: false` cannot later be exported
    // via `crypto.subtle.exportKey()` even by same-origin scripts.
    if (existing && typeof (existing as CryptoKey).type === 'string') {
        return existing;
    }

    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
    await idbPut(db, KEY_RECORD_ID, key);
    return key;
}

export const WebSecureStore = {
    isSupported,

    async getPlaintext(): Promise<string | null> {
        if (!isSupported()) return null;
        try {
            const db = await openDatabase();
            const record = await idbGet<EncryptedRecord>(db, VALUE_RECORD_ID);
            if (!record || !record.iv || !record.ciphertext) {
                return null;
            }
            const key = await getOrCreateMasterKey(db);
            // Copy IV/ciphertext into fresh `ArrayBuffer`-backed views. Values
            // read back from IndexedDB carry an `ArrayBufferLike` type which
            // TypeScript treats as possibly `SharedArrayBuffer`; WebCrypto
            // insists on `ArrayBuffer`. `.slice()` always returns a concrete
            // `ArrayBuffer`-backed `Uint8Array`.
            const ivView = new Uint8Array(record.iv as ArrayBufferLike).slice();
            const ciphertextView = new Uint8Array(record.ciphertext as ArrayBufferLike).slice();
            const plaintextBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: ivView },
                key,
                ciphertextView,
            );
            return new TextDecoder().decode(plaintextBuffer);
        } catch (error) {
            console.warn('[webSecureStore] getPlaintext failed:', error);
            return null;
        }
    },

    async setPlaintext(plaintext: string): Promise<void> {
        if (!isSupported()) {
            throw new Error('Secure storage is not available in this browser');
        }
        const db = await openDatabase();
        const key = await getOrCreateMasterKey(db);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plaintext);
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded,
        );
        // Persist the raw IV bytes as a detached ArrayBuffer so that reading
        // the record back yields a predictable `ArrayBuffer` (see the note on
        // `EncryptedRecord`). `.slice()` drops any typed-array framing and any
        // potential `ArrayBufferLike` variance.
        const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength);
        const record: EncryptedRecord = { iv: ivBuffer, ciphertext };
        await idbPut(db, VALUE_RECORD_ID, record);
    },

    async clear(): Promise<void> {
        if (!isSupported()) return;
        try {
            const db = await openDatabase();
            // We intentionally keep the master key around so that future
            // writes reuse it without a second round of keygen. Only the
            // encrypted value is removed.
            await idbDelete(db, VALUE_RECORD_ID);
        } catch (error) {
            console.warn('[webSecureStore] clear failed:', error);
        }
    },
};
