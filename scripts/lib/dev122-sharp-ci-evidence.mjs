export function assertSharpImageQcSummary(stdout, expectedSharp) {
  const summaries = String(stdout).split(/\r?\n/u).map(line => line.trim()).filter(line => line.startsWith('{') || line.startsWith('['));
  if (summaries.length !== 1) throw new Error('DEV122_SHARP_IMAGE_SUMMARY_COUNT');
  let summary;
  try { summary = JSON.parse(summaries[0]); } catch { throw new Error('DEV122_SHARP_IMAGE_SUMMARY_INVALID_JSON'); }
  if (!summary || typeof summary !== 'object' || Array.isArray(summary) || typeof expectedSharp !== 'string'
    || summary.scope !== 'IMAGE_ONLY_NO_SCHEMA_OR_FIXTURES'
    || summary.sharp !== expectedSharp || summary.expectedSharp !== expectedSharp
    || summary.versionMatches !== true
    || summary.tests !== 8 || summary.passed !== 8 || summary.failed !== 0) {
    throw new Error('DEV122_SHARP_IMAGE_SUMMARY_MISMATCH');
  }
  return summary;
}
