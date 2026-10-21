// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../index.html?raw';
import secure from '../public/data/secure.json';
import { QuizApp } from '../src/app';
import { mockQuestionId } from '../src/exam';

const bodyMarkup = indexHtml
  .replace(/[\s\S]*<body>/, '')
  .replace(/<\/body>[\s\S]*/, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const bank = secure as {
  multi: boolean;
  answer: string[];
}[];
const first = bank[0];
if (!first) throw new Error('secure bank is empty');

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

const click = (id: string): void => $(id).click();

const pick = (key: string): void => {
  ($(`ch-${key}`) as HTMLInputElement).checked = true;
};

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
        json: () => Promise.resolve(secure),
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

  it('grades a correct answer, shows the explanation, and advances', async () => {
    click('start-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });

    expect($('pos-text').textContent).toBe(`1 / ${bank.length}`);
    expect($('q-type-badge').textContent).toBe(
      first.multi ? '복수 정답' : '단일 정답',
    );

    for (const key of first.answer) pick(key);
    click('check-btn');

    expect($('result-msg').className).toContain('ok');
    expect($('result-msg').textContent).toBe('정답입니다.');
    expect(isHidden('explain-box')).toBe(false);
    expect(($('explain-text').textContent ?? '').length).toBeGreaterThan(0);
    expect(($('check-btn') as HTMLButtonElement).disabled).toBe(true);

    click('next-btn');
    expect($('pos-text').textContent).toBe(`2 / ${bank.length}`);
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
    click('check-btn');

    expect($('result-msg').className).toContain('ng');
    expect($('result-msg').textContent?.startsWith('오답입니다. 정답:')).toBe(
      true,
    );

    click('home-btn');
    expect(isHidden('setup-view')).toBe(false);
    expect(isHidden('review-btn')).toBe(false);
    expect($('history-attempts').textContent).toBe('1');
    expect($('history-wrong').textContent).toBe('1');

    const raw = localStorage.getItem('aws-saa-cert-quiz-history-v1');
    expect(raw).not.toBeNull();
    const history = JSON.parse(raw ?? '{}') as {
      secure?: { questions: Record<string, unknown> };
    };
    expect(Object.keys(history.secure?.questions ?? {})).toHaveLength(1);
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
    expect(isHidden('mode-field')).toBe(true);
    expect(isHidden('mock-panel')).toBe(false);
    expect($('start-btn').textContent).toContain('모의시험');

    click('start-btn');
    await vi.waitFor(() => {
      expect(isHidden('quiz-content')).toBe(false);
    });

    expect($('pos-text').textContent).toBe('1 / 65');
    expect(isHidden('timer-text')).toBe(false);
    expect($('timer-text').textContent).toMatch(/^2:(09|10):\d\d$/);
    expect(isHidden('check-btn')).toBe(true);

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
});
