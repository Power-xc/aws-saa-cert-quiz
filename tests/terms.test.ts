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

  it('annotates only the first occurrence of a concept', () => {
    expect(annotateTerms('다중 AZ 배포는 다중 AZ 대기 복제본을 둡니다')).toBe(
      '다중 AZ (Multi-AZ) 배포는 다중 AZ 대기 복제본을 둡니다',
    );
  });

  it('maps official Korean AWS wording back to the English exam term', () => {
    expect(annotateTerms('탄력적 IP 주소를 연결한다')).toBe(
      '탄력적 IP 주소 (Elastic IP address)를 연결한다',
    );
    expect(annotateTerms('예약 인스턴스로 구매')).toBe(
      '예약 인스턴스 (Reserved Instance)로 구매',
    );
  });

  it('leaves unrelated text untouched', () => {
    expect(annotateTerms('일반 텍스트')).toBe('일반 텍스트');
  });

  it('returns an empty string unchanged', () => {
    expect(annotateTerms('')).toBe('');
  });
});
