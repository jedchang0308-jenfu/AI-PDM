export function lowestAvailableSequence(usedValues: readonly number[], maxValue: number, label: string) {
  const used = [...new Set(usedValues.filter((value) => Number.isInteger(value) && value > 0 && value <= maxValue))]
    .sort((left, right) => left - right);
  let candidate = 1;
  for (const value of used) {
    if (value < candidate) continue;
    if (value > candidate) break;
    candidate += 1;
  }
  if (candidate > maxValue) throw new Error(`${label}_SEQUENCE_EXHAUSTED`);
  return candidate;
}
