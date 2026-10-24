import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import { parseQuestion } from '../src/exam';
import type { ExamKey } from '../src/types';
import secure from '../public/data/secure.json';
import resilient from '../public/data/resilient.json';
import performant from '../public/data/performant.json';
import cost from '../public/data/cost.json';

// Exact per-bank counts, kept in sync with the shipped data files.
const BANKS: Record<ExamKey, { count: number; rows: unknown[] }> = {
  secure: { count: 180, rows: secure },
  resilient: { count: 156, rows: resilient },
  performant: { count: 144, rows: performant },
  cost: { count: 120, rows: cost },
};

// Variants replaced by the wording of the official Korean AWS documentation.
// Reference lines ("참고: <doc title>") keep their English titles, and a gloss
// in parentheses such as "(Multi-AZ)" is allowed.
const NON_OFFICIAL_TERMS: readonly (readonly [
  label: string,
  pattern: RegExp,
])[] = [
  ['Elastic IP', /Elastic IP/],
  ['Reserved Instance', /Reserved Instance/],
  ['On-Demand', /On-Demand/],
  ['read replica', /(?<!\()read replica/i],
  ['읽기 복제본', /읽기 복제본/],
  ['라이프사이클', /라이프사이클/],
  ['페일오버', /페일오버/],
  ['크로스 리전', /크로스 리전/],
  ['Multi-AZ', /(?<!\()Multi-AZ(?!\))/],
];

describe.each(Object.entries(BANKS))('%s question bank', (_key, bank) => {
  it('ships the expected number of questions', () => {
    expect(bank.rows.length).toBe(bank.count);
  });

  it('matches the question count shown on the home screen', () => {
    const label = new RegExp(
      `data-value="${_key}"[\\s\\S]*?(\\d+)\\s*문제`,
    ).exec(indexHtml);
    expect(Number(label?.[1])).toBe(bank.count);
  });

  it('uses the official Korean AWS wording for common concepts', () => {
    const offenders: string[] = [];
    bank.rows.forEach((row, index) => {
      const question = parseQuestion(row, index);
      const text = [
        question.question.ko,
        ...question.choices.map((choice) => choice.ko),
        question.explanation.ko ?? '',
      ].join('\n');
      for (const line of text.split('\n')) {
        if (line.startsWith('참고:')) continue;
        for (const [label, pattern] of NON_OFFICIAL_TERMS) {
          if (pattern.test(line)) offenders.push(`#${question.id} ${label}`);
        }
      }
    });
    expect(offenders).toEqual([]);
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
