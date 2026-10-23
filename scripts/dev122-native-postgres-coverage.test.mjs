import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleCaseGroups, lifecycleRequiredCaseNames, lifecycleCaseProfiles, evaluateLifecycleCaseCoverage, assertLifecycleCaseCoverage } from './lib/dev122-native-postgres-coverage.mjs';

const complete = () => lifecycleRequiredCaseNames.map(fullName => ({ fullName, status: 'passed' }));
const options = { suite: 'lifecycle', selection: 'suite' };
const g01g02Profile = lifecycleCaseProfiles['g-01-g-02'];
const g01g02Options = { suite: 'ui', selection: 'g-01-g-02' };
const completeG01G02 = () => g01g02Profile.caseNames.map(fullName => ({ fullName, status: 'passed' }));
const crossCompany = lifecycleCaseGroups['P-03B'].find(name => name.includes('legal other-company'));

test('G-01/G-02 profile derives its deduplicated 17 exact names from mapped groups and is group-scoped', () => {
  const expectedNames = [...new Set([...lifecycleCaseGroups['G-01'], ...lifecycleCaseGroups['G-02']])];
  assert.deepEqual(g01g02Profile.groups, ['G-01', 'G-02']);
  assert.deepEqual(g01g02Profile.caseNames, expectedNames);
  assert.equal(g01g02Profile.caseNames.length, 17);

  const assertions = [
    ...completeG01G02(),
    { fullName: 'unselected pending case', status: 'pending' },
    { fullName: 'unselected skipped case', status: 'skipped' },
  ];
  const coverage = evaluateLifecycleCaseCoverage(assertions, g01g02Options);
  assert.equal(coverage.required, true);
  assert.equal(coverage.profile, 'g-01-g-02');
  assert.deepEqual(coverage.requiredGroupIds, ['G-01', 'G-02']);
  assert.deepEqual(coverage.expectedCaseNames, expectedNames);
  assert.equal(coverage.expectedCaseCount, 17);
  assert.equal(coverage.executedCaseCount, 17);
  assert.equal(coverage.executedAssertionCount, 17);
  assert.equal(coverage.status, 'PASS');
  assert.doesNotThrow(() => assertLifecycleCaseCoverage(coverage));
});

test('G-01/G-02 profile rejects each mapped name when missing, renamed, duplicated, pending, skipped, or failed', () => {
  for (const fullName of g01g02Profile.caseNames) {
    const withoutCase = completeG01G02().filter(row => row.fullName !== fullName);
    assert.equal(evaluateLifecycleCaseCoverage(withoutCase, g01g02Options).status, 'FAIL', `missing: ${fullName}`);

    const renamed = completeG01G02().map(row => row.fullName === fullName
      ? { ...row, fullName: `renamed ${fullName}` }
      : row);
    const renamedCoverage = evaluateLifecycleCaseCoverage(renamed, g01g02Options);
    assert.equal(renamedCoverage.status, 'FAIL', `renamed: ${fullName}`);
    assert.ok(renamedCoverage.unexpectedExecutedCases.some(row => row.name === `renamed ${fullName}`));

    const duplicated = [...completeG01G02(), { fullName, status: 'passed' }];
    assert.equal(evaluateLifecycleCaseCoverage(duplicated, g01g02Options).status, 'FAIL', `duplicate: ${fullName}`);

    for (const status of ['pending', 'skipped', 'failed']) {
      const changed = completeG01G02().map(row => row.fullName === fullName ? { ...row, status } : row);
      assert.equal(evaluateLifecycleCaseCoverage(changed, g01g02Options).status, 'FAIL', `${status}: ${fullName}`);
    }
  }
});

test('G-01/G-02 profile rejects every unexpected executed case but ignores unselected pending/skipped rows', () => {
  for (const status of ['passed', 'failed']) {
    const coverage = evaluateLifecycleCaseCoverage([
      ...completeG01G02(),
      { fullName: `unexpected ${status} case`, status },
    ], g01g02Options);
    assert.equal(coverage.status, 'FAIL');
    assert.deepEqual(coverage.unexpectedExecutedCases, [{ name: `unexpected ${status} case`, status }]);
    assert.throws(() => assertLifecycleCaseCoverage(coverage), /DEV122_LIFECYCLE_REQUIRED_CASES/);
  }
});

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
