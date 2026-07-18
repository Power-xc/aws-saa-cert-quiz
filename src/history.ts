import type { ExamKey, History, ProgressMap, QuestionRecord } from './types';

/** Fold one graded attempt into the cumulative history for an exam. */
export function recordAttempt(
  history: History,
  exam: ExamKey,
  questionId: number,
  result: boolean,
  now: string,
): History {
  const examHistory = history[exam];
  const questions = examHistory?.questions ?? {};
  const previous = questions[questionId];
  questions[questionId] = {
    attempts: (previous?.attempts ?? 0) + 1,
    correct: (previous?.correct ?? 0) + (result ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (result ? 0 : 1),
    lastResult: result,
    lastStudiedAt: now,
  };
  history[exam] = { ...examHistory, questions, lastStudiedAt: now };
  return history;
}

/**
 * One-time import of any legacy resumable session into the per-question
 * history, so early users keep their answered questions. Idempotent per exam
 * via the `progressV2Imported` flag.
 */
export function migrateProgress(
  progresses: ProgressMap,
  history: History,
  now: string,
): { history: History; changed: boolean } {
  let changed = false;
  for (const [key, progress] of Object.entries(progresses)) {
    const exam = key as ExamKey;
    if (progress?.version !== 2 || !Array.isArray(progress.order)) {
      continue;
    }
    const previous = history[exam];
    if (previous?.progressV2Imported) continue;
    const questions = previous?.questions ?? {};
    let imported = 0;
    for (const [position, result] of Object.entries(progress.results)) {
      if (typeof result !== 'boolean') continue;
      const questionId = progress.order[Number(position)];
      if (typeof questionId !== 'number' || questions[questionId]) continue;
      questions[questionId] = {
        attempts: 1,
        correct: result ? 1 : 0,
        wrong: result ? 0 : 1,
        lastResult: result,
        lastStudiedAt: now,
      };
      imported += 1;
    }
    history[exam] = {
      questions,
      lastStudiedAt: previous?.lastStudiedAt || (imported ? now : ''),
      progressV2Imported: true,
    };
    changed = true;
  }
  return { history, changed };
}

/** Ids of questions whose most recent attempt was wrong — the review pool. */
export function wrongQuestionIds(history: History, exam: ExamKey): Set<number> {
  const questions = history[exam]?.questions ?? {};
  const ids = new Set<number>();
  for (const [id, record] of Object.entries(questions)) {
    if (!record.lastResult) ids.add(Number(id));
  }
  return ids;
}

export interface HistorySummary {
  attempts: number;
  correct: number;
  wrongQuestions: number;
  lastStudiedAt: string;
}

export function summarize(history: History, exam: ExamKey): HistorySummary {
  const examHistory = history[exam];
  const records: QuestionRecord[] = examHistory
    ? Object.values(examHistory.questions)
    : [];
  return {
    attempts: records.reduce((sum, record) => sum + record.attempts, 0),
    correct: records.reduce((sum, record) => sum + record.correct, 0),
    wrongQuestions: records.filter((record) => !record.lastResult).length,
    lastStudiedAt: examHistory?.lastStudiedAt ?? '',
  };
}
