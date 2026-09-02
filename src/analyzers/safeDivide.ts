/** Returns null for absent, non-finite, or zero-denominator values. */
export function safeDivide(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (
    numerator === null ||
    denominator === null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }

  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}
