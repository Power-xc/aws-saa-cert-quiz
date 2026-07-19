import { byId, hide, show, toggle } from './dom';
import { EXAM_LABELS, loadExam, shuffle } from './exam';
import { grade } from './grading';
import { recordAttempt, wrongQuestionIds } from './history';
import {
  readHistory,
  readProgressMap,
  writeHistory,
  writeProgressMap,
} from './storage';
import { annotateTerms } from './terms';
import { describeError, nowIso } from './util';
import type {
  ExamKey,
  Progress,
  Question,
  QuestionOrder,
  SessionConfig,
  StudyMode,
} from './types';

export interface QuizSessionDeps {
  /** Return to the home screen (the shell shows the setup view). */
  onExitToHome: () => void;
  /** Persisted history changed — the shell should refresh its home stats. */
  onHistoryChanged: () => void;
}

/**
 * Owns everything about actually playing a quiz: loading questions, rendering
 * the current one, grading, navigation, the result summary, and the score
 * sheet. The app shell hands it a {@link SessionConfig} and reacts to its two
 * callbacks; it never reaches into the shell's own views.
 */
export class QuizSession {
  private exam: ExamKey = 'secure';
  private order: QuestionOrder = 'order';
  private studyMode: StudyMode = 'study';

  private questions: Question[] = [];
  private idx = 0;
  private answers: Record<number, string[]> = {};
  private results: Record<number, boolean | null> = {};

  /** True while re-practicing the wrong-answer pool — progress is not saved. */
  private review = false;
  /** True while viewing a graded question read-only from the score sheet. */
  private resultView = false;

  private readonly cache = new Map<ExamKey, Question[]>();

  private readonly quizView = byId('quiz-view');
  private readonly summaryView = byId('summary-view');
  private readonly sheetView = byId('sheet-view');
  private readonly loadingState = byId('loading-state');
  private readonly quizContent = byId('quiz-content');

  private readonly posText = byId('pos-text');
  private readonly progFill = byId('prog-fill');
  private readonly statsRow = byId('stats-row');
  private readonly badge = byId('q-type-badge');
  private readonly qText = byId('q-text');
  private readonly englishOriginal =
    byId<HTMLDetailsElement>('english-original');
  private readonly englishQuestion = byId('english-question');
  private readonly englishChoices = byId('english-choices');
  private readonly choicesContainer = byId('choices-container');
  private readonly checkBtn = byId<HTMLButtonElement>('check-btn');
  private readonly resultMsg = byId('result-msg');
  private readonly explainBox = byId('explain-box');
  private readonly explainText = byId('explain-text');
  private readonly prevBtn = byId<HTMLButtonElement>('prev-btn');
  private readonly nextBtn = byId<HTMLButtonElement>('next-btn');
  private readonly jumpInput = byId<HTMLInputElement>('jump-input');
  private readonly backToSheetBtn =
    byId<HTMLButtonElement>('back-to-sheet-btn');

  constructor(private readonly deps: QuizSessionDeps) {
    this.wire();
  }

  // ── Entry points ──────────────────────────────────────────────────────────
  async start(config: SessionConfig, resume: boolean): Promise<void> {
    this.applyConfig(config);
    this.review = false;
    this.resetSession();
    this.enterLoading();

    try {
      const questions = await this.load(this.exam);
      const saved = resume ? readProgressMap()[this.exam] : null;
      if (!resume) this.clearProgress(this.exam);
      if (!this.restoreProgress(saved, questions)) {
        if (resume) this.clearProgress(this.exam);
        this.questions =
          this.order === 'random' ? shuffle(questions) : [...questions];
      }
    } catch (error) {
      this.abortToHome(error);
      return;
    }

    hide(this.loadingState);
    show(this.quizContent);
    this.render();
    this.saveProgress();
  }

  async startReview(config: SessionConfig): Promise<void> {
    this.applyConfig(config);
    await this.runReview();
  }

  // ── Loading & setup ───────────────────────────────────────────────────────
  private applyConfig(config: SessionConfig): void {
    this.exam = config.exam;
    this.order = config.order;
    this.studyMode = config.studyMode;
  }

  private async load(exam: ExamKey): Promise<Question[]> {
    const cached = this.cache.get(exam);
    if (cached) return cached;
    const questions = await loadExam(exam);
    this.cache.set(exam, questions);
    return questions;
  }

  private enterLoading(): void {
    show(this.quizView);
    show(this.loadingState);
    hide(this.quizContent);
  }

  private abortToHome(error: unknown): void {
    hide(this.quizView);
    this.deps.onExitToHome();
    alert(describeError(error, '문제를 불러오는 중 오류가 발생했습니다.'));
  }

  private async runReview(): Promise<void> {
    this.enterLoading();
    try {
      const questions = await this.load(this.exam);
      const wrong = wrongQuestionIds(readHistory(), this.exam);
      let pool = questions.filter((question) => wrong.has(question.id));
      if (pool.length === 0) {
        this.abortToHome(
          new Error(
            '다시 풀 오답이 없어요. 문제를 풀고 틀린 문항이 생기면 오답노트가 열립니다.',
          ),
        );
        return;
      }
      if (this.order === 'random') pool = shuffle(pool);
      this.enterReview(pool);
    } catch (error) {
      this.abortToHome(error);
    }
  }

  private enterReview(pool: Question[]): void {
    if (pool.length === 0) return;
    this.review = true;
    this.resetSession();
    this.questions = pool;
    hide(this.summaryView);
    show(this.quizView);
    hide(this.loadingState);
    show(this.quizContent);
    this.render();
  }

  private resetSession(): void {
    this.idx = 0;
    this.answers = {};
    this.results = {};
  }

  private restoreProgress(
    saved: Progress | null | undefined,
    questions: Question[],
  ): boolean {
    if (saved?.version !== 2 || saved.total !== questions.length) return false;
    if (
      !Array.isArray(saved.order) ||
      saved.order.length !== questions.length
    ) {
      return false;
    }
    const byQuestionId = new Map(
      questions.map((question) => [question.id, question]),
    );
    if (saved.order.some((id) => !byQuestionId.has(id))) return false;
    if (
      !Number.isInteger(saved.idx) ||
      saved.idx < 0 ||
      saved.idx >= questions.length
    ) {
      return false;
    }
    this.questions = saved.order
      .map((id) => byQuestionId.get(id))
      .filter(isQuestion);
    if (this.questions.length !== questions.length) return false;
    this.idx = saved.idx;
    this.order = saved.mode === 'random' ? 'random' : 'order';
    this.studyMode = saved.studyMode === 'exam' ? 'exam' : 'study';
    this.answers = saved.answers;
    this.results = saved.results;
    return true;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  private render(): void {
    const question = this.questions[this.idx];
    if (!question) return;
    const total = this.questions.length;
    const isExam = this.isExamFlow();
    const answered = isExam
      ? this.questions.reduce(
          (sum, _question, i) => sum + (this.answers[i]?.length ? 1 : 0),
          0,
        )
      : Object.keys(this.results).length;
    const correct = Object.values(this.results).filter(
      (v) => v === true,
    ).length;

    this.posText.textContent = `${this.idx + 1} / ${total}`;
    this.progFill.style.width = `${Math.round((answered / total) * 100)}%`;
    this.statsRow.innerHTML = isExam
      ? `<span>시험 모드</span><span>응답 <b>${answered}/${total}</b></span>`
      : `<span>진행 <b>${answered}/${total}</b></span>` +
        `<span class="stat-correct">정답 <b>${correct}</b></span>` +
        `<span class="stat-wrong">오답 <b>${answered - correct}</b></span>`;

    this.badge.textContent = question.multi ? '복수 정답' : '단일 정답';
    this.badge.className = question.multi
      ? 'q-type-badge multi'
      : 'q-type-badge';

    this.qText.replaceChildren();
    this.appendLanguage(
      this.qText,
      '한국어',
      annotateTerms(question.question.ko),
    );
    this.renderEnglishOriginal(question);
    this.renderChoices(question);
    this.renderVerdict(question);
    this.renderControls(total);
  }

  private appendLanguage(
    container: HTMLElement,
    label: string,
    value: string,
  ): void {
    if (!value) return;
    const block = document.createElement('div');
    block.className = 'lang-block';
    const badge = document.createElement('span');
    badge.className = 'lang-label';
    badge.textContent = label;
    const text = document.createElement('span');
    text.textContent = value;
    block.append(badge, text);
    container.appendChild(block);
  }

  private renderEnglishOriginal(question: Question): void {
    this.englishOriginal.open = false;
    const englishChoices = question.choices.filter((choice) => choice.en);
    if (!question.question.en && englishChoices.length === 0) {
      hide(this.englishOriginal);
      return;
    }
    this.englishQuestion.textContent = question.question.en ?? '';
    this.englishChoices.replaceChildren();
    for (const choice of englishChoices) {
      const item = document.createElement('li');
      item.textContent = choice.en ?? '';
      this.englishChoices.appendChild(item);
    }
    show(this.englishOriginal);
  }

  private renderChoices(question: Question): void {
    const container = this.choicesContainer;
    container.replaceChildren();
    const selected = this.answers[this.idx] ?? [];
    const graded = this.idx in this.results;
    const answer = question.answer ?? [];

    for (const choice of question.choices) {
      const item = document.createElement('div');
      item.className = 'choice-item';

      const input = document.createElement('input');
      input.type = question.multi ? 'checkbox' : 'radio';
      input.name = 'choice';
      input.value = choice.key;
      input.id = `ch-${choice.key}`;
      input.checked = selected.includes(choice.key);
      input.disabled = graded;

      const label = document.createElement('label');
      label.className = 'choice-label';
      label.htmlFor = `ch-${choice.key}`;
      if (graded) {
        const picked = selected.includes(choice.key);
        const isAnswer = answer.includes(choice.key);
        if (isAnswer && picked) label.classList.add('correct');
        else if (!isAnswer && picked) label.classList.add('wrong');
        else if (isAnswer && !picked) label.classList.add('missed');
      }

      const key = document.createElement('span');
      key.className = 'choice-key';
      key.textContent = choice.key;

      const text = document.createElement('span');
      text.className = 'choice-text';
      text.textContent = annotateTerms(choice.ko);

      label.append(key, text);
      item.append(input, label);
      container.appendChild(item);
    }
  }

  private renderVerdict(question: Question): void {
    const graded = this.idx in this.results;
    if (!graded) {
      this.resultMsg.className = 'result-msg';
      this.checkBtn.textContent = '정답 확인';
      this.checkBtn.disabled = false;
      hide(this.explainBox);
      return;
    }

    const result = this.results[this.idx];
    if (result === null || result === undefined) {
      this.setResult('이 문제는 정답 데이터가 없습니다.', 'info');
    } else if (result) {
      this.setResult('정답입니다.', 'ok');
    } else {
      const answers = (question.answer ?? []).map((letter) => {
        const choice = question.choices.find((c) => c.key === letter);
        return choice ? `${letter}. ${choice.ko}` : letter;
      });
      this.setResult(`오답입니다. 정답: ${answers.join(', ')}`, 'ng');
    }
    this.checkBtn.textContent = '확인됨';
    this.checkBtn.disabled = true;
    this.renderExplanation(question);
  }

  private setResult(text: string, kind: 'ok' | 'ng' | 'info'): void {
    this.resultMsg.textContent = text;
    this.resultMsg.className = `result-msg show ${kind}`;
  }

  private renderExplanation(question: Question): void {
    const { ko, en } = question.explanation;
    if (!ko && !en) {
      hide(this.explainBox);
      return;
    }
    this.explainText.replaceChildren();
    this.appendLanguage(this.explainText, '한국어', annotateTerms(ko ?? ''));
    if (en) {
      const details = document.createElement('details');
      details.className = 'english-original';
      const summary = document.createElement('summary');
      summary.textContent = '영문 해설 보기';
      const content = document.createElement('div');
      content.className = 'english-original-content';
      content.textContent = en;
      details.append(summary, content);
      this.explainText.appendChild(details);
    }
    show(this.explainBox);
  }

  private renderControls(total: number): void {
    if (this.isExamFlow()) {
      hide(this.checkBtn);
      this.resultMsg.className = 'result-msg';
      hide(this.explainBox);
    } else {
      toggle(this.checkBtn, !this.resultView);
    }
    toggle(this.backToSheetBtn, this.resultView);

    this.jumpInput.value = '';
    this.jumpInput.placeholder = `1–${total}`;
    this.prevBtn.disabled = this.idx === 0;
    this.nextBtn.disabled = false;
    this.nextBtn.textContent =
      this.idx === total - 1
        ? this.resultView
          ? '채점표'
          : '결과 보기'
        : '다음';
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  private wire(): void {
    this.checkBtn.addEventListener('click', () => this.checkAnswer());
    this.prevBtn.addEventListener('click', () => this.goPrev());
    this.nextBtn.addEventListener('click', () => this.goNext());
    this.backToSheetBtn.addEventListener('click', () => this.showSheet());
    byId('jump-btn').addEventListener('click', () => this.jump());
    this.jumpInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.jump();
    });
    byId('home-btn').addEventListener('click', () => this.exitToHome());
    byId('sheet-btn').addEventListener('click', () => this.showSheet());
    byId('review-wrong-btn').addEventListener('click', () => {
      const pool = this.questions.filter(
        (_question, i) => this.results[i] === false,
      );
      this.enterReview(pool);
    });
    byId('retry-btn').addEventListener('click', () => this.retry());
    byId('summary-home-btn').addEventListener('click', () => this.exitToHome());
    byId('sheet-home-btn').addEventListener('click', () => {
      this.resultView = false;
      hide(this.sheetView);
      show(this.summaryView);
    });
    document.addEventListener('keydown', (event) => this.onShortcut(event));
  }

  private exitToHome(): void {
    if (this.isExamFlow()) this.captureSelection();
    this.saveProgress();
    this.review = false;
    this.resultView = false;
    hide(this.quizView);
    hide(this.summaryView);
    hide(this.sheetView);
    this.deps.onExitToHome();
  }

  private retry(): void {
    if (this.review) {
      hide(this.summaryView);
      void this.runReview();
      return;
    }
    this.clearProgress(this.exam);
    this.exitToHome();
  }

  private checkAnswer(): void {
    const question = this.questions[this.idx];
    if (!question) return;
    const selected = this.selectedLetters();
    if (selected.length === 0) {
      this.setResult('답을 선택해 주세요.', 'info');
      return;
    }
    const result = grade(selected, question.answer);
    this.answers[this.idx] = selected;
    this.results[this.idx] = result;
    this.persistAttempt(question.id, result);
    this.saveProgress();
    this.render();
  }

  private goPrev(): void {
    if (this.isExamFlow()) this.captureSelection();
    if (this.idx > 0) {
      this.idx -= 1;
      this.saveProgress();
      this.render();
    }
  }

  private goNext(): void {
    const last = this.questions.length - 1;
    if (this.isExamFlow()) this.captureSelection();
    if (this.idx < last) {
      this.idx += 1;
      this.saveProgress();
      this.render();
    } else if (this.resultView) {
      this.showSheet();
    } else {
      if (this.isExamFlow()) this.gradeExam();
      this.showSummary();
    }
  }

  private jump(): void {
    const value = Number.parseInt(this.jumpInput.value, 10);
    if (Number.isNaN(value)) return;
    if (this.isExamFlow()) this.captureSelection();
    this.idx = Math.max(0, Math.min(value - 1, this.questions.length - 1));
    this.saveProgress();
    this.render();
  }

  private onShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      return;
    const question = this.questions[this.idx];
    if (!question || this.quizContent.classList.contains('hidden')) return;

    if (event.key === 'ArrowLeft') this.prevBtn.click();
    if (event.key === 'ArrowRight') this.nextBtn.click();
    if (event.key === 'Enter') {
      if (this.isExamFlow()) this.nextBtn.click();
      else if (!this.checkBtn.disabled) this.checkAnswer();
      else this.nextBtn.click();
    }
    if (/^[a-e]$/i.test(event.key)) {
      const input = document.getElementById(
        `ch-${event.key.toUpperCase()}`,
      ) as HTMLInputElement | null;
      if (input && !input.disabled) {
        if (!question.multi) {
          for (const other of this.choicesContainer.querySelectorAll('input')) {
            other.checked = false;
          }
        }
        input.checked = !input.checked;
      }
    }
  }

  private selectedLetters(): string[] {
    return [
      ...this.choicesContainer.querySelectorAll<HTMLInputElement>('input'),
    ]
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  private captureSelection(): void {
    this.answers[this.idx] = this.selectedLetters();
  }

  /** Grade an exam-mode session in one pass: unanswered counts as wrong. */
  private gradeExam(): void {
    const history = readHistory();
    let touched = false;
    this.questions.forEach((question, i) => {
      const selected = this.answers[i] ?? [];
      const result = question.answer
        ? selected.length > 0
          ? grade(selected, question.answer)
          : false
        : null;
      this.results[i] = result;
      if (result !== null) {
        recordAttempt(history, this.exam, question.id, result, nowIso());
        touched = true;
      }
    });
    if (touched) this.commitHistory(history);
  }

  // ── Summary & score sheet ─────────────────────────────────────────────────
  private showSummary(): void {
    const total = this.questions.length;
    const correct = Object.values(this.results).filter(
      (v) => v === true,
    ).length;
    const wrong = Object.values(this.results).filter((v) => v === false).length;
    const suffix = this.review
      ? ' · 오답노트'
      : this.studyMode === 'exam'
        ? ' · 시험 모드'
        : '';
    byId('summary-exam-label').textContent =
      `${EXAM_LABELS[this.exam]}${suffix}`;
    byId('sum-total').textContent = String(total);
    byId('sum-correct').textContent = String(correct);
    byId('sum-wrong').textContent = String(wrong);

    const reviewWrong = byId('review-wrong-btn');
    toggle(reviewWrong, wrong > 0);
    if (wrong > 0) reviewWrong.textContent = `틀린 ${wrong}문제만 풀기`;

    this.saveProgress();
    hide(this.quizView);
    show(this.summaryView);
  }

  private showSheet(): void {
    this.resultView = false;
    const grid = byId('sheet-grid');
    grid.replaceChildren();
    const total = this.questions.length;
    let correct = 0;
    let wrong = 0;

    this.questions.forEach((question, i) => {
      const result = this.results[i];
      if (result === true) correct += 1;
      else if (result === false) wrong += 1;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `sheet-cell ${result === true ? 'ok' : result === false ? 'ng' : 'na'}`;
      cell.textContent = String(i + 1);
      const mine = (this.answers[i] ?? []).join(', ') || '—';
      const answer = (question.answer ?? []).join(', ') || '—';
      cell.title = `${i + 1}번 · 내 답 ${mine} / 정답 ${answer}`;
      cell.addEventListener('click', () => this.openResultDetail(i));
      grid.appendChild(cell);
    });

    const pct = total ? Math.round((correct / total) * 100) : 0;
    byId('sheet-score').innerHTML =
      `점수 <b>${pct}%</b> · 정답 <b class="c-green">${correct}</b>` +
      ` / 오답 <b class="c-red">${wrong}</b> / 전체 <b>${total}</b>`;

    hide(this.summaryView);
    hide(this.quizView);
    show(this.sheetView);
  }

  private openResultDetail(index: number): void {
    this.resultView = true;
    this.idx = index;
    hide(this.sheetView);
    hide(this.summaryView);
    show(this.quizView);
    hide(this.loadingState);
    show(this.quizContent);
    this.render();
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  private persistAttempt(questionId: number, result: boolean | null): void {
    if (result === null) return;
    const history = recordAttempt(
      readHistory(),
      this.exam,
      questionId,
      result,
      nowIso(),
    );
    this.commitHistory(history);
  }

  private commitHistory(history: Parameters<typeof writeHistory>[0]): void {
    try {
      writeHistory(history);
    } catch {
      return;
    }
    this.deps.onHistoryChanged();
  }

  private saveProgress(): void {
    if (this.review || this.resultView || this.questions.length === 0) return;
    const map = readProgressMap();
    map[this.exam] = {
      version: 2,
      total: this.questions.length,
      order: this.questions.map((question) => question.id),
      mode: this.order,
      studyMode: this.studyMode,
      idx: this.idx,
      answers: this.answers,
      results: this.results,
    };
    writeProgressMap(map);
  }

  private clearProgress(exam: ExamKey): void {
    const map = readProgressMap();
    delete map[exam];
    writeProgressMap(map);
  }

  private isExamFlow(): boolean {
    return this.studyMode === 'exam' && !this.review && !this.resultView;
  }
}

function isQuestion(question: Question | undefined): question is Question {
  return question !== undefined;
}
