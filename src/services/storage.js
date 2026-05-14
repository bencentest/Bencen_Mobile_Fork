export const APP_STORAGE_PREFIX = 'bencen_';

export function buildStorageKey(...parts) {
    const suffix = parts
        .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
        .map((part) => String(part).trim())
        .join('_');

    return `${APP_STORAGE_PREFIX}${suffix}`;
}

export function getScopedStorageKey(scope, suffix) {
    return buildStorageKey(scope, suffix);
}

export function readJsonStorage(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

export function writeJsonStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        void 0;
    }
}

export function removeStorageItem(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        void 0;
    }
}

export function readStorage(key, fallback = null) {
    try {
        const value = localStorage.getItem(key);
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

export function writeStorage(key, value) {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        void 0;
    }
}

export function clearAppStorage() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key && key.startsWith(APP_STORAGE_PREFIX)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
        void 0;
    }
}
