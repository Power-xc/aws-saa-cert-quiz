import { describe, expect, it } from 'vitest';
import {
  migrateProgress,
  recordAttempt,
  summarize,
  wrongQuestionIds,
} from '../src/history';
import type { History, ProgressMap } from '../src/types';

const NOW = '2026-05-01T00:00:00.000Z';

describe('recordAttempt', () => {
  it('creates a record on the first attempt', () => {
    const history = recordAttempt({}, 'secure', 1, true, NOW);
    expect(history.secure?.questions['1']).toEqual({
      attempts: 1,
      correct: 1,
      wrong: 0,
      lastResult: true,
      lastStudiedAt: NOW,
    });
  });

  it('accumulates counts across attempts', () => {
    let history: History = {};
    history = recordAttempt(history, 'secure', 1, true, NOW);
    history = recordAttempt(history, 'secure', 1, false, NOW);
    expect(history.secure?.questions['1']).toMatchObject({
      attempts: 2,
      correct: 1,
      wrong: 1,
      lastResult: false,
    });
  });
});

describe('wrongQuestionIds', () => {
  it('collects questions whose last attempt was wrong', () => {
    let history: History = {};
    history = recordAttempt(history, 'secure', 1, false, NOW);
    history = recordAttempt(history, 'secure', 2, true, NOW);
    expect([...wrongQuestionIds(history, 'secure')]).toEqual([1]);
  });

  it('drops a question once it is answered correctly again', () => {
    let history: History = {};
    history = recordAttempt(history, 'secure', 1, false, NOW);
    history = recordAttempt(history, 'secure', 1, true, NOW);
    expect(wrongQuestionIds(history, 'secure').size).toBe(0);
  });
});

describe('summarize', () => {
  it('aggregates attempts, corrects, and outstanding wrong questions', () => {
    let history: History = {};
    history = recordAttempt(history, 'secure', 1, true, NOW);
    history = recordAttempt(history, 'secure', 2, false, NOW);
    const summary = summarize(history, 'secure');
    expect(summary.attempts).toBe(2);
    expect(summary.correct).toBe(1);
    expect(summary.wrongQuestions).toBe(1);
  });
});

describe('migrateProgress', () => {
  it('imports a legacy resumable session exactly once', () => {
    const progresses: ProgressMap = {
      secure: {
        version: 2,
        total: 2,
        order: [10, 20],
        mode: 'order',
        studyMode: 'study',
        idx: 0,
        answers: {},
        results: { 0: true, 1: false },
      },
    };
    const first = migrateProgress(progresses, {}, NOW);
    expect(first.changed).toBe(true);
    expect(first.history.secure?.questions['10']?.lastResult).toBe(true);
    expect(first.history.secure?.questions['20']?.lastResult).toBe(false);

    const second = migrateProgress(progresses, first.history, NOW);
    expect(second.changed).toBe(false);
  });
});
