// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../index.html?raw';
import aif from '../public/data/aif.json';
import { QuizApp } from '../src/app';
import { mockQuestionId } from '../src/exam';

const bodyMarkup = indexHtml
  .replace(/[\s\S]*<body>/, '')
  .replace(/<\/body>[\s\S]*/, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const bank = aif as {
  multi: boolean;
  answer: string[];
}[];
const first = bank[0];
if (!first) throw new Error('AIF-C01 bank is empty');

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const click = (id: string): void => $(id).click();

// A real click, so the change event fires and the study flow grades on pick.
const pick = (key: string): void => click(`ch-${key}`);

const resultShown = (): boolean => $('result-msg').classList.contains('show');

const isHidden = (id: string): boolean => $(id).classList.contains('hidden');

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => map.delete(key),
    setItem: (key: string, value: string) => map.set(key, value),
  };
}

beforeEach(() => {
  document.body.innerHTML = bodyMarkup;
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(aif),
      } as Response),
    ),
  );
  new QuizApp().init();
});

describe('QuizApp study session', () => {
  it('renders the home screen with a clean history', () => {
    expect(isHidden('setup-view')).toBe(false);
    expect($('history-attempts').textContent).toBe('0');
    expect(isHidden('review-btn')).toBe(true);
    expect(isHidden('continue-btn')).toBe(true);
  });

  it('grades a correct answer as soon as it is picked, then moves on by itself', async () => {
    click('start-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });

    expect($('pos-text').textContent).toBe(`1 / ${bank.length}`);
    expect($('q-type-badge').textContent).toContain(
      first.multi ? '복수 정답' : '단일 정답',
    );

    for (const key of first.answer) pick(key);

    expect($('result-msg').className).toContain('ok');
    expect($('result-msg').textContent).toBe('정답입니다.');
    expect(isHidden('explain-box')).toBe(false);
    expect(($('explain-text').textContent ?? '').length).toBeGreaterThan(0);
    const firstKey = first.answer[0] ?? 'A';
    expect(($(`ch-${firstKey}`) as HTMLInputElement).disabled).toBe(true);

    await vi.waitFor(() => {
      expect($('pos-text').textContent).toBe(`2 / ${bank.length}`);
    });
  });

  it('grades a multiple-response question only once enough choices are picked', async () => {
    const index = bank.findIndex(
      (question) => question.multi && question.answer.length > 1,
    );
    const multi = bank[index];
    if (!multi)
      throw new Error('AIF-C01 bank has no multiple-response question');

    click('start-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });
    ($('jump-input') as HTMLInputElement).value = String(index + 1);
    click('jump-btn');
    expect($('q-type-badge').textContent).toBe(
      `복수 정답 · ${multi.answer.length}개 고르기`,
    );

    const [head, ...rest] = multi.answer;
    pick(head ?? 'A');
    expect($('result-msg').className).toContain('info');
    expect(isHidden('explain-box')).toBe(true);

    for (const key of rest) pick(key);
    expect($('result-msg').textContent).toBe('정답입니다.');
    expect(isHidden('explain-box')).toBe(false);

    await vi.waitFor(() => {
      expect($('pos-text').textContent).toBe(`${index + 2} / ${bank.length}`);
    });
  });

  it('moves on after a pick but keeps it ungraded until the end in exam mode', async () => {
    const examMode = document.querySelector<HTMLButtonElement>(
      '#mode-group [data-value="exam"]',
    );
    if (!examMode) throw new Error('missing exam mode button');
    examMode.click();

    click('start-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });
    pick(first.answer[0] ?? 'A');

    expect(resultShown()).toBe(false);
    expect(isHidden('explain-box')).toBe(true);
    await vi.waitFor(() => {
      expect($('pos-text').textContent).toBe(`2 / ${bank.length}`);
    });
    expect(resultShown()).toBe(false);
  });

  it('marks a wrong answer and opens the review pool afterwards', async () => {
    click('start-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });

    const answer = first.answer;
    const wrongKey = ['A', 'B', 'C', 'D', 'E'].find(
      (key) => !answer.includes(key) && document.getElementById(`ch-${key}`),
    );
    expect(wrongKey).toBeDefined();
    pick(wrongKey ?? 'A');

    expect($('result-msg').className).toContain('ng');
    expect($('result-msg').textContent?.startsWith('오답입니다. 정답:')).toBe(
      true,
    );
    // A wrong answer stays up with its explanation instead of moving on.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect($('pos-text').textContent).toBe(`1 / ${bank.length}`);

    click('home-btn');
    expect(isHidden('setup-view')).toBe(false);
    expect(isHidden('review-btn')).toBe(false);
    expect($('history-attempts').textContent).toBe('1');
    expect($('history-wrong').textContent).toBe('1');

    const raw = localStorage.getItem('aws-saa-cert-quiz-history-v1');
    expect(raw).not.toBeNull();
    const history = JSON.parse(raw ?? '{}') as {
      aif?: { questions: Record<string, unknown> };
    };
    expect(Object.keys(history.aif?.questions ?? {})).toHaveLength(1);
  });

  it('resumes an interrupted session via 이어 풀기', async () => {
    click('start-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });
    click('next-btn'); // move to question 2, which saves progress
    click('home-btn');

    expect(isHidden('continue-btn')).toBe(false);
    expect($('continue-btn').textContent).toContain('2번부터');

    click('continue-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });
    expect($('pos-text').textContent).toBe(`2 / ${bank.length}`);
  });
});

describe('QuizApp mock exam', () => {
  const selectMock = (): void => {
    const button = document.querySelector<HTMLButtonElement>(
      '#exam-group [data-value="mock"]',
    );
    if (!button) throw new Error('missing mock exam button');
    button.click();
  };

  it('swaps the study settings for the mock panel and starts a timed exam', async () => {
    selectMock();
    expect(isHidden('order-field')).toBe(true);
    expect(isHidden('mode-field')).toBe(false);
    expect(isHidden('mock-panel')).toBe(false);
    expect($('start-btn').textContent).toContain('모의시험');

    click('start-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });

    expect($('pos-text').textContent).toBe('1 / 65');
    expect(isHidden('timer-text')).toBe(false);
    expect($('timer-text').textContent).toMatch(/^2:(09|10):\d\d$/);

    // Study mode is the default, so a mock pick is graded right away too.
    const firstChoice = document.querySelector<HTMLInputElement>(
      '#choices-container input',
    );
    firstChoice?.click();
    expect(resultShown()).toBe(true);

    click('home-btn'); // stops the countdown interval
  });

  it('grades an expired exam on resume and credits each source domain', async () => {
    const answer = first.answer;
    localStorage.setItem(
      'aws-saa-cert-quiz-progress-v2',
      JSON.stringify({
        mock: {
          version: 2,
          total: 3,
          order: [
            mockQuestionId('secure', 1),
            mockQuestionId('cost', 2),
            mockQuestionId('cost', 3),
          ],
          mode: 'random',
          studyMode: 'exam',
          idx: 0,
          answers: { 0: answer },
          results: {},
          endsAt: Date.now() - 1000,
        },
      }),
    );

    selectMock();
    expect(isHidden('continue-btn')).toBe(false);
    click('continue-btn');
    await vi.waitFor(() => {
      expect(isHidden('summary-view')).toBe(false);
    });

    expect($('summary-exam-label').textContent).toContain('시간 종료');
    expect($('sum-total').textContent).toBe('3');
    expect($('sum-correct').textContent).toBe('1');
    expect($('sum-wrong').textContent).toBe('2');
    expect(isHidden('summary-domains')).toBe(false);
    expect($('summary-domains').textContent).toContain('Secure');

    const history = JSON.parse(
      localStorage.getItem('aws-saa-cert-quiz-history-v1') ?? '{}',
    ) as Record<string, { questions: Record<string, unknown> }>;
    expect(Object.keys(history.secure?.questions ?? {})).toEqual(['1']);
    expect(Object.keys(history.cost?.questions ?? {}).sort()).toEqual([
      '2',
      '3',
    ]);

    const results = JSON.parse(
      localStorage.getItem('aws-saa-cert-quiz-mock-v1') ?? '[]',
    ) as { correct: number; total: number }[];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ correct: 1, total: 3 });

    const progress = JSON.parse(
      localStorage.getItem('aws-saa-cert-quiz-progress-v2') ?? '{}',
    ) as Record<string, unknown>;
    expect(progress.mock).toBeUndefined();
  });

  it('keeps questions graded on pick when a study-mode mock times out', async () => {
    localStorage.setItem(
      'aws-saa-cert-quiz-progress-v2',
      JSON.stringify({
        mock: {
          version: 2,
          total: 3,
          order: [
            mockQuestionId('secure', 1),
            mockQuestionId('cost', 2),
            mockQuestionId('cost', 3),
          ],
          mode: 'random',
          studyMode: 'study',
          idx: 1,
          answers: { 0: first.answer },
          results: { 0: true },
          endsAt: Date.now() - 1000,
        },
      }),
    );

    selectMock();
    click('continue-btn');
    await vi.waitFor(() => {
      expect(isHidden('summary-view')).toBe(false);
    });

    expect($('sum-correct').textContent).toBe('1');
    expect($('sum-wrong').textContent).toBe('2');

    // The pick-time attempt was already logged; the time-out must not log it again.
    const history = JSON.parse(
      localStorage.getItem('aws-saa-cert-quiz-history-v1') ?? '{}',
    ) as Record<string, { questions: Record<string, unknown> }>;
    expect(history.secure).toBeUndefined();
    expect(Object.keys(history.cost?.questions ?? {}).sort()).toEqual([
      '2',
      '3',
    ]);
  });
});
