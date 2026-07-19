import { describe, expect, it } from 'vitest';
import { annotateTerms } from '../src/terms';

describe('annotateTerms', () => {
  it('appends the English term for a known concept', () => {
    expect(annotateTerms('가용 영역에 분산 배포')).toBe(
      '가용 영역 (Availability Zone)에 분산 배포',
    );
  });

  it('does not double-annotate when a bracket already follows', () => {
    expect(annotateTerms('가용 영역(Availability Zone)')).toBe(
      '가용 영역(Availability Zone)',
    );
  });

  it('leaves unrelated text untouched', () => {
    expect(annotateTerms('일반 텍스트')).toBe('일반 텍스트');
  });

  it('returns an empty string unchanged', () => {
    expect(annotateTerms('')).toBe('');
  });
});
