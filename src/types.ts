export type ExamKey = 'secure' | 'resilient' | 'performant' | 'cost';
/** A playable session: one domain bank, or the mixed 65-question mock exam. */
export type SessionKey = ExamKey | 'mock';
export type QuestionOrder = 'order' | 'random';
export type StudyMode = 'study' | 'exam';
export type Theme = 'light' | 'dark';

/** The choices made on the home screen before a session starts. */
export interface SessionConfig {
  exam: SessionKey;
  order: QuestionOrder;
  studyMode: StudyMode;
}

/** One answer option. `en` is present only for banks with an English original. */
export interface Choice {
  key: string;
  ko: string;
  en?: string;
}

/** A single, fully normalized quiz question. */
export interface Question {
  id: number;
  multi: boolean;
  question: { ko: string; en?: string };
  choices: Choice[];
  answer: string[] | null;
  explanation: { ko?: string; en?: string };
  /** Set on mock-exam questions: the bank and id they were drawn from. */
  source?: { exam: ExamKey; id: number };
}

/** Per-question study record, aggregated across attempts. */
export interface QuestionRecord {
  attempts: number;
  correct: number;
  wrong: number;
  lastResult: boolean;
  lastStudiedAt: string;
}

export interface ExamHistory {
  questions: Record<string, QuestionRecord>;
  lastStudiedAt: string;
  progressV2Imported?: boolean;
}

export type History = Partial<Record<ExamKey, ExamHistory>>;

/** Resumable session snapshot for one exam. */
export interface Progress {
  version: 2;
  total: number;
  order: number[];
  mode: QuestionOrder;
  studyMode: StudyMode;
  idx: number;
  answers: Record<number, string[]>;
  results: Record<number, boolean | null>;
  /** Mock exam only: epoch ms when the countdown ends. */
  endsAt?: number;
}

export type ProgressMap = Partial<Record<SessionKey, Progress>>;

/** Per-domain tally of one finished mock exam. */
export type MockDomainScores = Record<
  ExamKey,
  { correct: number; total: number }
>;

export interface MockResult {
  at: string;
  correct: number;
  total: number;
  domains: MockDomainScores;
}
