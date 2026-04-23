/**
 * One-shot migration that moves pre-existing web credentials out of
 * `localStorage` and into the encrypted IndexedDB-backed store. Older
 * builds stored the full `{ token, secret }` payload as plain JSON in
 * `localStorage.auth_credentials` and `auth_credentials_fallback`,
 * which any XSS could scrape in a single line of script. Running the
 * migration on first load of the new build clears those legacy entries
 * and re-persists them through the encrypted path.
 */
import { WebSecureStore } from './webSecureStore';

const LEGACY_AUTH_KEY = 'auth_credentials';
const LEGACY_FALLBACK_KEY = 'auth_credentials_fallback';

let migrationPromise: Promise<void> | null = null;

function doMigrate(): Promise<void> {
    if (typeof localStorage === 'undefined') return Promise.resolve();
    if (!WebSecureStore.isSupported()) return Promise.resolve();

    const legacyPrimary = localStorage.getItem(LEGACY_AUTH_KEY);
    const legacyFallback = localStorage.getItem(LEGACY_FALLBACK_KEY);
    const legacyJson = legacyPrimary ?? legacyFallback;
    if (!legacyJson) return Promise.resolve();

    return (async () => {
        const existingSecure = await WebSecureStore.getPlaintext();
        if (!existingSecure) {
            try {
                await WebSecureStore.setPlaintext(legacyJson);
                console.log('[tokenStorage] Migrated legacy web credentials to encrypted store');
            } catch (error) {
                console.warn('[tokenStorage] Failed to migrate legacy credentials; leaving them in place:', error);
                // Do not clear legacy values if the secure write failed —
                // that would effectively log the user out with no recovery.
                return;
            }
        }
        // Once the secure copy exists we no longer need the plaintext
        // localStorage entries for any reason.
        localStorage.removeItem(LEGACY_AUTH_KEY);
        localStorage.removeItem(LEGACY_FALLBACK_KEY);
    })();
}

export function ensureWebCredentialsMigrated(): Promise<void> {
    if (!migrationPromise) {
        migrationPromise = doMigrate().catch((error) => {
            console.warn('[tokenStorage] migration threw:', error);
        });
    }
    return migrationPromise;
}
