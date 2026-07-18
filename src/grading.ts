/**
 * Grade a selection against the correct answer.
 * Returns `null` when the question has no answer key (ungraded),
 * mirroring how the UI marks such questions as excluded from scoring.
 */
export function grade(
  selected: readonly string[],
  answer: readonly string[] | null,
): boolean | null {
  if (!answer) return null;
  if (selected.length !== answer.length) return false;
  const expected = [...answer].sort();
  return [...selected].sort().every((value, i) => value === expected[i]);
}
