import { buildStorageKey, readJsonStorage, removeStorageItem, writeJsonStorage } from './storage';

function getCacheEnvelopeKey(key) {
    return buildStorageKey('cache', key);
}

export function getCachedValue(key) {
    const envelope = readJsonStorage(getCacheEnvelopeKey(key), null);
    if (!envelope || typeof envelope !== 'object' || !('data' in envelope)) {
        return null;
    }

    return envelope.data;
}

export function setCachedValue(key, data) {
    writeJsonStorage(getCacheEnvelopeKey(key), {
        updatedAt: Date.now(),
        data
    });
}

export function invalidateCachedValue(key) {
    removeStorageItem(getCacheEnvelopeKey(key));
}
