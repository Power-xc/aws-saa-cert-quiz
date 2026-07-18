import type { Choice, ExamKey, Question } from './types';

export const EXAM_KEYS = ['secure', 'resilient', 'performant', 'cost'] as const;

export const EXAM_LABELS: Record<ExamKey, string> = {
  secure: 'Secure — 보안 아키텍처 설계',
  resilient: 'Resilient — 복원력 있는 아키텍처 설계',
  performant: 'Performant — 고성능 아키텍처 설계',
  cost: 'Cost — 비용 최적화 아키텍처 설계',
};

export function isExamKey(value: string): value is ExamKey {
  return (EXAM_KEYS as readonly string[]).includes(value);
}

export async function loadExam(key: ExamKey): Promise<Question[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${key}.json`);
  if (!response.ok) {
    throw new Error(`문제 파일을 불러오지 못했습니다. (${response.status})`);
  }
  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) {
    throw new Error('문제 파일 형식이 올바르지 않습니다.');
  }
  return raw.map(parseQuestion);
}

/** Coerce one untrusted record into a `Question`, filling sensible defaults. */
export function parseQuestion(raw: unknown, index: number): Question {
  if (!isRecord(raw)) throw new Error('문제 데이터가 손상되었습니다.');

  const source = isRecord(raw.question) ? raw.question : {};
  const question: Question['question'] = { ko: asString(source.ko) };
  if (typeof source.en === 'string') question.en = source.en;

  const rawExplanation = isRecord(raw.explanation) ? raw.explanation : {};
  const explanation: Question['explanation'] = {};
  if (typeof rawExplanation.ko === 'string') {
    explanation.ko = rawExplanation.ko;
  }
  if (typeof rawExplanation.en === 'string') {
    explanation.en = rawExplanation.en;
  }

  const rawChoices = Array.isArray(raw.choices) ? raw.choices : [];
  const choices = rawChoices.map((choice: unknown): Choice => {
    const entry = isRecord(choice) ? choice : {};
    const parsed: Choice = { key: asString(entry.key), ko: asString(entry.ko) };
    if (typeof entry.en === 'string') parsed.en = entry.en;
    return parsed;
  });

  const answer = Array.isArray(raw.answer)
    ? raw.answer.filter(
        (letter): letter is string => typeof letter === 'string',
      )
    : null;

  return {
    id: typeof raw.id === 'number' ? raw.id : index + 1,
    multi: raw.multi === true,
    question,
    choices,
    answer,
    explanation,
  };
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
