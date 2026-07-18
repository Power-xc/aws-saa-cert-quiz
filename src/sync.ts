import type { ExamKey, History } from './types';

export const SYNC_PREFIX = 'sync=';
const PAYLOAD_KIND = 'saa-quiz-history';
const INVALID_CODE = '형식이 올바른 동기화 코드가 아니에요.';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  let base64 = code.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode the whole study history to a portable, URL-safe code. */
export function encodeHistory(history: History): string {
  return toBase64Url(JSON.stringify({ v: 1, kind: PAYLOAD_KIND, history }));
}

/** Decode a shared code (or link) back to a history object. */
export function decodeHistory(input: string): History {
  const raw = input.trim();
  if (!raw) throw new Error('코드가 비어 있어요.');
  const code = raw.includes(SYNC_PREFIX)
    ? raw.slice(raw.lastIndexOf(SYNC_PREFIX) + SYNC_PREFIX.length).trim()
    : raw;

  let payload: unknown;
  try {
    payload = JSON.parse(fromBase64Url(code));
  } catch {
    throw new Error(INVALID_CODE);
  }
  if (!isRecord(payload) || payload.kind !== PAYLOAD_KIND) {
    throw new Error(INVALID_CODE);
  }
  const history = payload.history;
  if (!isRecord(history)) throw new Error(INVALID_CODE);
  return history;
}

/**
 * Merge an incoming history into the local one, in place. For a question seen
 * on both devices, the more recently studied attempt wins, so re-importing an
 * old snapshot never double-counts.
 */
export function mergeHistory(
  local: History,
  incoming: History,
): { history: History; merged: number } {
  let merged = 0;
  for (const [key, examData] of Object.entries(incoming)) {
    if (!examData) continue;
    const exam = key as ExamKey;
    const localExam = local[exam];
    const localQuestions = localExam?.questions ?? {};
    for (const [id, record] of Object.entries(examData.questions)) {
      const current = localQuestions[id];
      if (
        !current ||
        (record.lastStudiedAt || '') > (current.lastStudiedAt || '')
      ) {
        localQuestions[id] = record;
        merged += 1;
      }
    }
    const lastStudiedAt =
      [localExam?.lastStudiedAt, examData.lastStudiedAt]
        .filter((value): value is string => Boolean(value))
        .sort()
        .pop() ?? '';
    local[exam] = { ...localExam, questions: localQuestions, lastStudiedAt };
  }
  return { history: local, merged };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
