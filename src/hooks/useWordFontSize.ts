import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'wordFontSize';
export const WORD_FONT_SIZE_MIN = 12;
export const WORD_FONT_SIZE_MAX = 28;
export const WORD_FONT_SIZE_DEFAULT = 17;
const STEP = 1;

function clamp(value: number): number {
  return Math.min(WORD_FONT_SIZE_MAX, Math.max(WORD_FONT_SIZE_MIN, value));
}

function readStored(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? clamp(parsed) : WORD_FONT_SIZE_DEFAULT;
}

/** localStorage에 저장되는 낙하 단어 글자 크기 — GameBoardPage와 설정 화면이 공유. */
export function useWordFontSize() {
  const [fontSize, setFontSizeState] = useState<number>(readStored);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFontSizeState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setFontSize = useCallback((value: number) => {
    const next = clamp(value);
    localStorage.setItem(STORAGE_KEY, String(next));
    setFontSizeState(next);
  }, []);

  const increase = useCallback(() => setFontSize(readStored() + STEP), [setFontSize]);
  const decrease = useCallback(() => setFontSize(readStored() - STEP), [setFontSize]);

  return { fontSize, setFontSize, increase, decrease };
}
