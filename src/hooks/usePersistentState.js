import { useEffect, useState } from 'react';
import { readJsonStorage, removeStorageItem, writeJsonStorage } from '../services/storage';

export function usePersistentState(storageKey, initialValue) {
    const [state, setState] = useState(() => {
        if (!storageKey) {
            return typeof initialValue === 'function' ? initialValue() : initialValue;
        }

        const fallback = typeof initialValue === 'function' ? initialValue() : initialValue;
        return readJsonStorage(storageKey, fallback);
    });

    useEffect(() => {
        if (!storageKey) return;

        if (state === undefined) {
            removeStorageItem(storageKey);
            return;
        }

        writeJsonStorage(storageKey, state);
    }, [storageKey, state]);

    return [state, setState];
}
