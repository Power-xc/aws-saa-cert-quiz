import { describe, expect, it } from 'vitest';
import {
  buildMockExam,
  EXAM_KEYS,
  MOCK_QUOTA,
  mockPool,
  mockQuestionId,
} from '../src/exam';
import type { ExamKey, Question } from '../src/types';

const makeBank = (count: number): Question[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    multi: false,
    question: { ko: `q${i + 1}` },
    choices: [
      { key: 'A', ko: 'a' },
      { key: 'B', ko: 'b' },
    ],
    answer: ['A'],
    explanation: { ko: 'e' },
  }));

const makeBanks = (count: number): Record<ExamKey, Question[]> => ({
  secure: makeBank(count),
  resilient: makeBank(count),
  performant: makeBank(count),
  cost: makeBank(count),
});

describe('mock exam', () => {
  it('quotas add up to the 65 questions of the real exam', () => {
    const total = EXAM_KEYS.reduce((sum, key) => sum + MOCK_QUOTA[key], 0);
    expect(total).toBe(65);
  });

  it('draws each domain quota with unique ids and a source per question', () => {
    const exam = buildMockExam(mockPool(makeBanks(30)));

    expect(exam).toHaveLength(65);
    expect(new Set(exam.map((question) => question.id)).size).toBe(65);
    for (const key of EXAM_KEYS) {
      const drawn = exam.filter((question) => question.source?.exam === key);
      expect(drawn).toHaveLength(MOCK_QUOTA[key]);
    }
  });

  it('keeps questions that share a bank id apart and traceable', () => {
    const pool = mockPool(makeBanks(5));

    expect(new Set(pool.map((question) => question.id)).size).toBe(20);
    const cost3 = pool.find(
      (question) => question.id === mockQuestionId('cost', 3),
    );
    expect(cost3?.source).toEqual({ exam: 'cost', id: 3 });
  });

  it('takes what a short bank has when it cannot fill its quota', () => {
    const banks = { ...makeBanks(30), cost: makeBank(4) };
    const exam = buildMockExam(mockPool(banks));

    expect(
      exam.filter((question) => question.source?.exam === 'cost'),
    ).toHaveLength(4);
    expect(exam).toHaveLength(65 - MOCK_QUOTA.cost + 4);
  });
});
