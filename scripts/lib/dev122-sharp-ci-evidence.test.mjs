import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSharpImageQcSummary } from './dev122-sharp-ci-evidence.mjs';

const valid = { scope: 'IMAGE_ONLY_NO_SCHEMA_OR_FIXTURES', sharp: '0.35.5', expectedSharp: '0.35.5', versionMatches: true, tests: 8, passed: 8, failed: 0 };
const stdout = value => 'PASS PPC-IMG-001\n' + JSON.stringify(value) + '\n';
test('accepts one complete runtime summary alongside case output', () => {
  assert.deepEqual(assertSharpImageQcSummary(stdout(valid), '0.35.5'), valid);
});
for (const [name, value] of [
  ['wrong evidence scope', { ...valid, scope: 'SCHEMA_AND_FIXTURES' }],
  ['old actual runtime version', { ...valid, sharp: '0.35.4' }],
  ['wrong reported expected pin', { ...valid, expectedSharp: '0.35.4' }],
  ['reported version mismatch', { ...valid, versionMatches: false }],
  ['missing test count', { ...valid, tests: undefined }],
  ['incomplete case count', { ...valid, tests: 7, passed: 7 }],
  ['failed converter case', { ...valid, passed: 7, failed: 1 }],
  ['string instead of numeric counts', { ...valid, tests: '8', passed: '8', failed: '0' }],
  ['string instead of boolean version match', { ...valid, versionMatches: 'true' }],
  ['untyped or absent expected pin', valid],
]) {
  test('rejects ' + name + ' even when the child would exit zero', () => {
    assert.throws(() => assertSharpImageQcSummary(stdout(value), name === 'untyped or absent expected pin' ? undefined : '0.35.5'));
  });
}
for (const [name, output] of [
  ['missing summary', 'PASS PPC-IMG-001\n'],
  ['malformed summary', '{"scope":invalid}\n'],
  ['duplicate summaries', stdout(valid) + JSON.stringify(valid) + '\n'],
  ['unexpected extra JSON output', stdout(valid) + '{"other":"output"}\n'],
  ['null payload', '{"scope":null}\n'],
  ['array payload', '[]\n'],
  ['extra array alongside a valid summary', stdout(valid) + '[]\n'],
]) {
  test('rejects ' + name + ' instead of accepting a successful process exit', () => {
    assert.throws(() => assertSharpImageQcSummary(output, '0.35.5'));
  });
}
