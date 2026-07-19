import { describe, expect, it } from 'vitest';
import { grade } from '../src/grading';

describe('grade', () => {
  it('returns null when there is no answer key', () => {
    expect(grade(['A'], null)).toBeNull();
  });

  it('accepts a correct single answer', () => {
    expect(grade(['C'], ['C'])).toBe(true);
  });

  it('is order-independent for multiple answers', () => {
    expect(grade(['B', 'A'], ['A', 'B'])).toBe(true);
  });

  it('rejects a partial selection', () => {
    expect(grade(['A'], ['A', 'B'])).toBe(false);
  });

  it('rejects an extra selection', () => {
    expect(grade(['A', 'B', 'C'], ['A', 'B'])).toBe(false);
  });

  it('rejects a wrong single answer', () => {
    expect(grade(['D'], ['C'])).toBe(false);
  });
});
