import type { History, MockResult, ProgressMap, Theme } from './types';

const THEME_KEY = 'aws-saa-cert-quiz-theme';
const PROGRESS_KEY = 'aws-saa-cert-quiz-progress-v2';
const HISTORY_KEY = 'aws-saa-cert-quiz-history-v1';
const MOCK_STORAGE_KEY = 'aws-saa-cert-quiz-mock-v1';
const MOCK_RESULTS_KEPT = 10;

/** Read and parse a JSON object from localStorage, tolerating any failure. */
function readObject<T extends object>(key: string): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // Corrupt or unavailable storage falls through to an empty object.
  }
  return {} as T;
}

function writeObject(key: string, value: object): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readProgressMap(): ProgressMap {
  return readObject<ProgressMap>(PROGRESS_KEY);
}

export function writeProgressMap(map: ProgressMap): void {
  try {
    writeObject(PROGRESS_KEY, map);
  } catch {
    // Progress is best-effort; ignore quota/availability errors.
  }
}

export function readHistory(): History {
  return readObject<History>(HISTORY_KEY);
}

/** Persist history. Throws on quota errors so callers can surface the failure. */
export function writeHistory(history: History): void {
  writeObject(HISTORY_KEY, history);
}

/** Finished mock exams, oldest first, capped to the most recent few. */
export function readMockResults(): MockResult[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(MOCK_STORAGE_KEY) ?? '[]',
    );
    if (Array.isArray(parsed)) {
      return (parsed as MockResult[]).filter(
        (result) =>
          typeof result?.correct === 'number' &&
          typeof result.total === 'number' &&
          result.total > 0,
      );
    }
  } catch {
    // Corrupt or unavailable storage falls through to an empty log.
  }
  return [];
}

export function appendMockResult(result: MockResult): void {
  const kept = [...readMockResults(), result].slice(-MOCK_RESULTS_KEPT);
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // The score log is best-effort; ignore quota/availability errors.
  }
}

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore — the theme still applies for the current session.
  }
}
