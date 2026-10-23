const lifecycle = title => `DEV122 D03/D04 native canonical lifecycle ${title}`;
const principal = title => `Signed Principal session + real request guard -> actual part/drawing work and review on native PostgreSQL ${title}`;
const partRollback = lifecycle('rolls back a post-formalize failure and then replays the same request exactly once');
const drawingRollback = lifecycle('keeps a minor master Draft, then atomically releases the exact major master after post-formalize rollback and replay');

// Minimum native evidence only. These names do not close the original 29 groups:
// P-02A needs UI failure evidence; P-02C covers the Drawing helper, not Part HTTP/UI.
// TX-01D is a bounded audit attribution, not an additional contract gate.
export const lifecycleCaseGroups = {
  'P-01': [principal('creates, edits, submits and approves a part; only the assigned Principal can decide, with exact replay'),
    ...['part', 'minor'].map(kind => lifecycle(`historical v1 ${kind} nonrelease basis remains compatible without inventing frozen counters`))],
  'P-02B': [lifecycle('uses normal Draft creation and release-only review before a real transfer can be submitted and approved')],
  'P-02C': [drawingRollback],
  'P-03A': [lifecycle('returns a first-release Part to its original owner and resubmits a fresh immutable package before approval')],
  'P-03B': [
    lifecycle('rejects submit with no eligible current reviewer, then restores the assignment and retries'),
    lifecycle('rejects Part reviewer self with complete owned rollback'),
    lifecycle('rejects a legal other-company Principal at the workspace scope adapter with its own issuer fixture contract'),
    lifecycle('revokes the actual published reviewer assignment after submit, denies with no effects, then restores and retries'),
  ],
  'P-04A': [...['work_version', 'formal_version', 'formal_payload', 'master_status', 'master_hash']
    .map(variant => lifecycle(`rejects native ${variant} drift with all owned rows unchanged by the rejected decision`)),
    lifecycle('rolls back all Part effects when the frozen native work deletion CAS affects zero rows')],
  'P-04B': [lifecycle('serializes two native approvals to one release and rejects a completed-key decision collision'),
    lifecycle('approves a subsequent major from a normally Released master with concurrent approval and exact replay')],
  'G-01': [drawingRollback],
  'G-02': [
    ...['NeedInfo', 'Rejected', 'Active', 'PendingReview', 'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid']
      .map(state => lifecycle(`rejects major start from actual ${state} master without a release effect`)),
    ...['Draft', 'NeedInfo', 'Rejected', 'Active', 'PendingReview', 'Released']
      .map(state => lifecycle(`approves minor with legal ${state} master without changing master or production pointer`)),
    ...['pending', 'needs_info'].map(state => lifecycle(`rejects minor with another numbering ${state} request without any submission effects`)),
  ],
  'G-03B': [lifecycle('freezes mapped Drawing work version and rejects independent drift')],
  'TX-01A': [partRollback, drawingRollback],
  'TX-01B': [partRollback],
  'TX-01C': [drawingRollback],
};

export const lifecycleRequiredCaseNames = [...new Set(Object.values(lifecycleCaseGroups).flat())];

const lifecycleProfileGroups = {
  'g-01-g-02': ['G-01', 'G-02'],
};

// Profiles derive their exact case names from the authoritative group mapping above.
export const lifecycleCaseProfiles = Object.fromEntries(
  Object.entries(lifecycleProfileGroups).map(([profile, groupIds]) => [
    profile,
    {
      groups: groupIds,
      caseNames: [...new Set(groupIds.flatMap(groupId => lifecycleCaseGroups[groupId] ?? []))],
    },
  ]),
);

export function evaluateLifecycleCaseCoverage(assertions, { suite, selection }) {
  const profile = suite === 'ui' && Object.hasOwn(lifecycleCaseProfiles, selection) ? selection : null;
  const required = (['lifecycle', 'all'].includes(suite) && selection === 'suite') || profile !== null;
  const requiredGroupIds = profile
    ? lifecycleCaseProfiles[profile].groups
    : required ? Object.keys(lifecycleCaseGroups) : [];
  const requiredCaseNames = profile
    ? lifecycleCaseProfiles[profile].caseNames
    : required ? lifecycleRequiredCaseNames : [];
  const nameOf = test => test.fullName || [...(test.ancestorTitles || []), test.title].join(' ');
  const assertionsByName = new Map();
  for (const assertion of assertions) {
    const name = nameOf(assertion);
    const rows = assertionsByName.get(name) ?? [];
    rows.push(assertion);
    assertionsByName.set(name, rows);
  }
  const groups = Object.entries(lifecycleCaseGroups).map(([id, names]) => {
    const cases = names.map(name => {
      const statuses = (assertionsByName.get(name) ?? []).map(test => test.status);
      return { name, statuses, passed: statuses.length === 1 && statuses[0] === 'passed' };
    });
    return { id, cases, status: cases.every(test => test.passed) ? 'PASS' : 'INCOMPLETE' };
  });
  const selectedGroups = groups.filter(group => requiredGroupIds.includes(group.id));
  const expectedNames = new Set(requiredCaseNames);
  const unexpectedExecutedCases = profile
    ? assertions
      .filter(test => !expectedNames.has(nameOf(test)) && !['pending', 'skipped'].includes(test.status))
      .map(test => ({ name: nameOf(test), status: test.status }))
    : [];
  const executedCaseCount = requiredCaseNames.filter(name =>
    (assertionsByName.get(name) ?? []).some(test => !['pending', 'skipped'].includes(test.status)),
  ).length;
  const executedAssertionCount = requiredCaseNames.reduce((count, name) =>
    count + (assertionsByName.get(name) ?? []).filter(test => !['pending', 'skipped'].includes(test.status)).length,
  0);
  const requiredGroupsPass = selectedGroups.every(group => group.status === 'PASS');
  return {
    required,
    profile,
    status: required ? requiredGroupsPass && unexpectedExecutedCases.length === 0 ? 'PASS' : 'FAIL' : 'NOT_REQUIRED',
    evidenceScope: 'MINIMUM_NATIVE_PARTIAL_EVIDENCE_NOT_GROUP_ACCEPTANCE',
    requiredGroupIds,
    expectedCaseNames: requiredCaseNames,
    expectedCaseCount: requiredCaseNames.length,
    executedCaseCount,
    executedAssertionCount,
    unexpectedExecutedCases,
    groups,
    partial: groups.filter(group => group.cases.some(test => test.passed)).map(group => group.id),
    notRun: ['P-02A save-failure UI', 'P-02C Part readiness HTTP body and mounted UI', 'remaining exact variants in all 29 QA groups'],
  };
}

export function assertLifecycleCaseCoverage(coverage) {
  if (coverage.required && coverage.status !== 'PASS') {
    throw Object.assign(new Error('DEV122_LIFECYCLE_REQUIRED_CASES_MISSING_SKIPPED_FAILED_OR_DUPLICATE'), {
      mismatches: coverage.groups.filter(group => coverage.requiredGroupIds.includes(group.id) && group.status !== 'PASS'),
      unexpectedExecutedCases: coverage.unexpectedExecutedCases,
    });
  }
}
