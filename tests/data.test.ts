import { describe, expect, it } from 'vitest';
import { parseQuestion } from '../src/exam';
import type { ExamKey } from '../src/types';
import secure from '../public/data/secure.json';
import resilient from '../public/data/resilient.json';
import performant from '../public/data/performant.json';
import cost from '../public/data/cost.json';

// Exact per-bank counts, kept in sync with the shipped data files.
const BANKS: Record<ExamKey, { count: number; rows: unknown[] }> = {
  secure: { count: 42, rows: secure },
  resilient: { count: 36, rows: resilient },
  performant: { count: 44, rows: performant },
  cost: { count: 32, rows: cost },
};

describe.each(Object.entries(BANKS))('%s question bank', (_key, bank) => {
  it('ships the expected number of questions', () => {
    expect(bank.rows.length).toBe(bank.count);
  });

  it('parses cleanly and satisfies referential invariants', () => {
    const ids = new Set<number>();
    bank.rows.forEach((row, index) => {
      const question = parseQuestion(row, index);
      expect(question.question.ko.length).toBeGreaterThan(0);
      expect(question.choices.length).toBeGreaterThanOrEqual(2);

      const keys = new Set(question.choices.map((choice) => choice.key));
      expect(keys.size).toBe(question.choices.length);

      expect(question.answer).not.toBeNull();
      expect(question.answer?.length).toBeGreaterThan(0);
      for (const letter of question.answer ?? []) {
        expect(keys.has(letter)).toBe(true);
      }
      if (question.multi) {
        expect(question.answer?.length).toBeGreaterThanOrEqual(2);
        expect(question.choices.length).toBeGreaterThanOrEqual(5);
      } else {
        expect(question.answer?.length).toBe(1);
      }

      expect(question.explanation.ko?.length ?? 0).toBeGreaterThan(0);

      expect(ids.has(question.id)).toBe(false);
      ids.add(question.id);
    });
  });
});
