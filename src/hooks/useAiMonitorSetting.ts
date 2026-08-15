import { useCallback, useEffect, useState } from 'react';

export const AI_MONITOR_STORAGE_PREFIX = 'aiMonitorEnabled:';

function storageKey(userId: string): string {
  return `${AI_MONITOR_STORAGE_PREFIX}${userId}`;
}

function readEnabled(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(storageKey(userId)) === 'true';
  } catch {
    return false;
  }
}

export function useAiMonitorSetting(userId: string | null | undefined) {
  const [, bumpVersion] = useState(0);
  const userIdReady = Boolean(userId);
  const enabled = userIdReady ? readEnabled(userId) : false;

  useEffect(() => {
    if (!userId) return undefined;

    const key = storageKey(userId);
    const onStorage = (event: StorageEvent) => {
      let isLocalStorageClear = false;
      try { isLocalStorageClear = event.key === null && event.storageArea === localStorage; } catch { /* storage may be unavailable */ }
      if (event.key === key || isLocalStorageClear) bumpVersion(version => version + 1);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  const setEnabled = useCallback((next: boolean) => {
    if (!userId) return;
    try {
      localStorage.setItem(storageKey(userId), String(next));
    } catch {
      // Storage may be unavailable; keep the current in-memory setting.
    }
    bumpVersion(version => version + 1);
  }, [userId]);

  return { enabled: userIdReady ? enabled : false, setEnabled, userIdReady };
}
