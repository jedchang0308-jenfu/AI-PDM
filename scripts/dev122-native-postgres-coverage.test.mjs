import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleCaseGroups, lifecycleRequiredCaseNames, evaluateLifecycleCaseCoverage, assertLifecycleCaseCoverage } from './lib/dev122-native-postgres-coverage.mjs';

const complete = () => lifecycleRequiredCaseNames.map(fullName => ({ fullName, status: 'passed' }));
const options = { suite: 'lifecycle', selection: 'suite' };
const crossCompany = lifecycleCaseGroups['P-03B'].find(name => name.includes('legal other-company'));

test('complete lifecycle/all evidence passes despite unrelated suite skips', () => {
  for (const suite of ['lifecycle', 'all']) {
    const coverage = evaluateLifecycleCaseCoverage([...complete(), { fullName: 'unselected files case', status: 'skipped' }], { ...options, suite });
    assert.equal(coverage.status, 'PASS');
    assert.doesNotThrow(() => assertLifecycleCaseCoverage(coverage));
    assert.ok(coverage.partial.includes('G-03B'));
    assert.ok(!coverage.partial.includes('TX-01D'));
    assert.ok(!coverage.partial.includes('P-02A'));
  }
});

for (const status of ['missing', 'skipped', 'pending', 'failed', 'duplicate']) {
  test(`nonzero passed count cannot hide a ${status} required wrong-company case`, () => {
    const assertions = complete().filter(row => row.fullName !== crossCompany);
    if (status !== 'missing') assertions.push({ fullName: crossCompany, status: status === 'duplicate' ? 'passed' : status });
    if (status === 'duplicate') assertions.push({ fullName: crossCompany, status: 'passed' });
    const coverage = evaluateLifecycleCaseCoverage(assertions, options);
    assert.equal(coverage.status, 'FAIL');
    assert.throws(() => assertLifecycleCaseCoverage(coverage), /DEV122_LIFECYCLE_REQUIRED_CASES/);
    assert.equal(coverage.groups.find(group => group.id === 'P-03B').status, 'INCOMPLETE');
  });
}

test('every minimum case is necessary and binds the entire exact fullName', () => {
  for (const fullName of lifecycleRequiredCaseNames) {
    const renamed = complete().map(row => row.fullName === fullName ? { ...row, fullName: `wrong describe ${fullName}` } : row);
    assert.throws(() => assertLifecycleCaseCoverage(evaluateLifecycleCaseCoverage(renamed, options)));
  }
});

test('narrow selector reports only its actual partial evidence without requiring the whole lifecycle', () => {
  const coverage = evaluateLifecycleCaseCoverage([{ fullName: crossCompany, status: 'passed' }], { ...options, selection: 'other-company-scope' });
  assert.equal(coverage.status, 'NOT_REQUIRED');
  assert.deepEqual(coverage.partial, ['P-03B']);
  assert.equal(coverage.groups.find(group => group.id === 'P-03B').status, 'INCOMPLETE');
  assert.doesNotThrow(() => assertLifecycleCaseCoverage(coverage));
});

test('UI prerequisites and files/procurement selections do not acquire lifecycle requirements', () => {
  for (const suite of ['ui', 'files', 'procurement', 'settings']) {
    const coverage = evaluateLifecycleCaseCoverage([], { ...options, suite });
    assert.equal(coverage.status, 'NOT_REQUIRED');
    assert.deepEqual(coverage.partial, []);
    assert.doesNotThrow(() => assertLifecycleCaseCoverage(coverage));
  }
});

test('Vitest ancestor/title fallback preserves exact names', () => {
  const assertions = complete().map(({ fullName, status }) => ({ ancestorTitles: [fullName.slice(0, fullName.lastIndexOf(' '))], title: fullName.slice(fullName.lastIndexOf(' ') + 1), status }));
  assert.equal(evaluateLifecycleCaseCoverage(assertions, options).status, 'PASS');
});
