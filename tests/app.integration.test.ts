// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../index.html?raw';
import secure from '../public/data/secure.json';
import { QuizApp } from '../src/app';

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
