import { byId, hide, show, toggle } from './dom';
import { isExamKey } from './exam';
import { migrateProgress, summarize, wrongQuestionIds } from './history';
import {
  readHistory,
  readProgressMap,
  readTheme,
  writeHistory,
  writeTheme,
} from './storage';
import {
  decodeHistory,
  encodeHistory,
  mergeHistory,
  SYNC_PREFIX,
} from './sync';
import { QuizSession } from './quiz-session';
import { describeError } from './util';
import type {
  ExamKey,
  QuestionOrder,
  SessionConfig,
  StudyMode,
  Theme,
} from './types';

/**
 * The app shell: the home screen (exam/mode selection and study stats), theme,
 * the memory-notes and cross-device-sync panels, and the entry points into a
 * {@link QuizSession}. It owns no quiz-playing state itself.
 */
export class QuizApp {
  private exam: ExamKey = 'secure';
  private order: QuestionOrder = 'order';
  private studyMode: StudyMode = 'study';

  private readonly session = new QuizSession({
    onExitToHome: () => this.showHome(),
    onHistoryChanged: () => this.renderHistorySummary(),
  });

  private readonly setupView = byId('setup-view');
  private readonly notesView = byId('notes-view');
  private readonly syncView = byId('sync-view');

  private readonly historyAttempts = byId('history-attempts');
  private readonly historyRate = byId('history-rate');
  private readonly historyWrong = byId('history-wrong');
  private readonly historyLast = byId('history-last');
  private readonly continueBtn = byId<HTMLButtonElement>('continue-btn');
  private readonly reviewBtn = byId<HTMLButtonElement>('review-btn');
  private readonly themeToggle = byId<HTMLButtonElement>('theme-toggle');

  init(): void {
    this.wireHome();
    this.wireSync();

    this.applyTheme(readTheme());
    this.migrateLegacyProgress();
    this.consumeSyncHash();
    this.updateContinueButton();
    this.renderHistorySummary();
  }

  private config(): SessionConfig {
    return { exam: this.exam, order: this.order, studyMode: this.studyMode };
  }

  // ── Home ──────────────────────────────────────────────────────────────────
  private wireHome(): void {
    this.segmentedGroup('exam-group', (value) => {
      if (isExamKey(value)) this.exam = value;
      this.updateContinueButton();
      this.renderHistorySummary();
    });
    this.segmentedGroup('order-group', (value) => {
      this.order = value === 'random' ? 'random' : 'order';
    });
    this.segmentedGroup('mode-group', (value) => {
      this.studyMode = value === 'exam' ? 'exam' : 'study';
    });

    byId('start-btn').addEventListener('click', () => {
      hide(this.setupView);
      void this.session.start(this.config(), false);
    });
    this.continueBtn.addEventListener('click', () => {
      hide(this.setupView);
      void this.session.start(this.config(), true);
    });
    this.reviewBtn.addEventListener('click', () => {
      hide(this.setupView);
      void this.session.startReview(this.config());
    });
    byId('notes-btn').addEventListener('click', () => {
      hide(this.setupView);
      show(this.notesView);
    });
    byId('notes-home-btn').addEventListener('click', () => {
      hide(this.notesView);
      this.showHome();
    });
    this.themeToggle.addEventListener('click', () => {
      const next: Theme =
        document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      this.applyTheme(next);
    });
  }

  private segmentedGroup(
    groupId: string,
    onChange: (value: string) => void,
  ): void {
    const group = byId(groupId);
    const buttons = group.querySelectorAll<HTMLButtonElement>('.seg-btn');
    for (const button of buttons) {
      button.addEventListener('click', () => {
        for (const other of buttons) other.classList.remove('active');
        button.classList.add('active');
        onChange(button.dataset.value ?? '');
      });
    }
  }

  private showHome(): void {
    show(this.setupView);
    this.updateContinueButton();
    this.renderHistorySummary();
  }

  private renderHistorySummary(): void {
    const summary = summarize(readHistory(), this.exam);
    this.historyAttempts.textContent = String(summary.attempts);
    this.historyRate.textContent = summary.attempts
      ? `${Math.round((summary.correct / summary.attempts) * 100)}%`
      : '-';
    this.historyWrong.textContent = String(summary.wrongQuestions);
    this.historyLast.textContent = summary.lastStudiedAt
      ? new Date(summary.lastStudiedAt).toLocaleDateString('ko-KR', {
          month: 'numeric',
          day: 'numeric',
        })
      : '-';
    this.updateReviewButton();
  }

  private updateReviewButton(): void {
    const count = wrongQuestionIds(readHistory(), this.exam).size;
    toggle(this.reviewBtn, count > 0);
    if (count > 0) this.reviewBtn.textContent = `오답노트 · ${count}문제`;
  }

  private updateContinueButton(): void {
    const saved = readProgressMap()[this.exam];
    const resumable = saved?.version === 2 && Number.isInteger(saved.idx);
    toggle(this.continueBtn, resumable);
    if (saved && resumable) {
      this.continueBtn.textContent = `이어 풀기 · ${saved.idx + 1}번부터`;
    }
  }

  private applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    this.themeToggle.textContent =
      theme === 'light' ? '다크 모드' : '화이트 모드';
    writeTheme(theme);
  }

  private migrateLegacyProgress(): void {
    const { history, changed } = migrateProgress(
      readProgressMap(),
      readHistory(),
      new Date().toISOString(),
    );
    if (changed) {
      try {
        writeHistory(history);
      } catch {
        // Best effort — the legacy session is still usable via "이어 풀기".
      }
    }
  }

  // ── Cross-device sync ─────────────────────────────────────────────────────
  private wireSync(): void {
    byId('sync-btn').addEventListener('click', () => {
      hide(this.setupView);
      show(this.syncView);
      hide(byId('sync-export-result'));
      byId('sync-export-msg').className = 'sync-msg';
      byId('sync-import-msg').className = 'sync-msg';
    });
    byId('sync-home-btn').addEventListener('click', () => {
      hide(this.syncView);
      this.showHome();
    });
    byId('sync-export-btn').addEventListener('click', () => {
      byId<HTMLTextAreaElement>('sync-code-out').value =
        encodeHistory(readHistory());
      show(byId('sync-export-result'));
      byId('sync-export-msg').className = 'sync-msg';
    });
    byId('sync-copy-code-btn').addEventListener('click', () => {
      void this.copyAndReport(
        byId<HTMLTextAreaElement>('sync-code-out').value,
        {
          ok: '코드를 복사했어요. 다른 기기에 붙여넣어 가져오세요.',
          fail: '복사 실패 — 코드를 길게 눌러 직접 복사해 주세요.',
        },
      );
    });
    byId('sync-copy-link-btn').addEventListener('click', () => {
      const link = this.syncLink(
        byId<HTMLTextAreaElement>('sync-code-out').value,
      );
      void this.copyAndReport(link, {
        ok: '공유 링크를 복사했어요. 다른 기기에서 열면 바로 합쳐집니다.',
        fail: '복사 실패 — 코드 복사를 이용해 주세요.',
      });
    });
    byId('sync-import-btn').addEventListener('click', () => this.importSync());
  }

  private importSync(): void {
    const input = byId<HTMLTextAreaElement>('sync-code-in');
    try {
      const { history, merged } = mergeHistory(
        readHistory(),
        decodeHistory(input.value),
      );
      writeHistory(history);
      this.renderHistorySummary();
      this.updateContinueButton();
      this.setSyncMsg(
        'sync-import-msg',
        `가져왔어요. 문항 ${merged}개 반영 완료.`,
        true,
      );
      input.value = '';
    } catch (error) {
      this.setSyncMsg(
        'sync-import-msg',
        describeError(error, '가져오기에 실패했어요.'),
        false,
      );
    }
  }

  private consumeSyncHash(): void {
    const match = /sync=([^&]+)/.exec(location.hash);
    if (match?.[1]) {
      try {
        const incoming = decodeHistory(match[1]);
        if (
          confirm(
            '다른 기기의 학습 기록을 가져올까요? 현재 기기 기록과 합쳐집니다.',
          )
        ) {
          const { history, merged } = mergeHistory(readHistory(), incoming);
          writeHistory(history);
          alert(`가져왔어요. 문항 ${merged}개 반영 완료.`);
        }
      } catch (error) {
        alert(`동기화 링크를 읽지 못했어요: ${describeError(error, '')}`);
      }
    }
    history.replaceState(null, '', location.pathname + location.search);
  }

  private async copyAndReport(
    text: string,
    messages: { ok: string; fail: string },
  ): Promise<void> {
    const ok = await copyText(text);
    this.setSyncMsg('sync-export-msg', ok ? messages.ok : messages.fail, ok);
  }

  private syncLink(code: string): string {
    return `${location.origin}${location.pathname}#${SYNC_PREFIX}${code}`;
  }

  private setSyncMsg(id: string, text: string, ok: boolean): void {
    const el = byId(id);
    el.textContent = text;
    el.className = `sync-msg show ${ok ? 'ok' : 'ng'}`;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the execCommand fallback.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- clipboard API fallback for non-secure contexts
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
