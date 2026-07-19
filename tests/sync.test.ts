import { describe, expect, it } from 'vitest';
import {
  decodeHistory,
  encodeHistory,
  mergeHistory,
  SYNC_PREFIX,
} from '../src/sync';
import type { History, QuestionRecord } from '../src/types';

function record(date: string, correct = true): QuestionRecord {
  return {
    attempts: 1,
    correct: correct ? 1 : 0,
    wrong: correct ? 0 : 1,
    lastResult: correct,
    lastStudiedAt: date,
  };
}

const sample: History = {
  secure: {
    questions: { 1: record('2026-01-01T00:00:00.000Z') },
    lastStudiedAt: '2026-01-01T00:00:00.000Z',
  },
};

describe('encode / decode', () => {
  it('round-trips a history object', () => {
    expect(decodeHistory(encodeHistory(sample))).toEqual(sample);
  });

  it('survives non-ASCII content', () => {
    const history: History = {
      secure: { questions: {}, lastStudiedAt: '한글값' },
    };
    expect(decodeHistory(encodeHistory(history))).toEqual(history);
  });

  it('accepts a full share link, not just the bare code', () => {
    const code = encodeHistory(sample);
    expect(decodeHistory(`https://example.dev/#${SYNC_PREFIX}${code}`)).toEqual(
      sample,
    );
  });

  it('rejects empty input', () => {
    expect(() => decodeHistory('   ')).toThrow();
  });

  it('rejects a malformed code', () => {
    expect(() => decodeHistory('not-a-real-code')).toThrow();
  });
});

describe('mergeHistory', () => {
  it('keeps the more recently studied attempt per question', () => {
    const local: History = {
      secure: {
        questions: { 1: record('2026-01-01', true) },
        lastStudiedAt: '2026-01-01',
      },
    };
    const incoming: History = {
      secure: {
        questions: { 1: record('2026-02-01', false) },
        lastStudiedAt: '2026-02-01',
      },
    };
    const { history, merged } = mergeHistory(local, incoming);
    expect(merged).toBe(1);
    expect(history.secure?.questions['1']?.lastResult).toBe(false);
  });

  it('does not overwrite with an older attempt', () => {
    const local: History = {
      secure: {
        questions: { 1: record('2026-03-01', false) },
        lastStudiedAt: '2026-03-01',
      },
    };
    const incoming: History = {
      secure: {
        questions: { 1: record('2026-01-01', true) },
        lastStudiedAt: '2026-01-01',
      },
    };
    expect(mergeHistory(local, incoming).merged).toBe(0);
  });

  it('adds questions unique to the incoming device', () => {
    const local: History = { secure: { questions: {}, lastStudiedAt: '' } };
    const incoming: History = {
      secure: {
        questions: { 9: record('2026-01-01') },
        lastStudiedAt: '2026-01-01',
      },
    };
    const { history, merged } = mergeHistory(local, incoming);
    expect(merged).toBe(1);
    expect(history.secure?.questions['9']).toBeDefined();
  });
});
