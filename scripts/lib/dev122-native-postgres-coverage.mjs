const lifecycle = title => `DEV122 D03/D04 native canonical lifecycle ${title}`;
const principal = title => `Signed Principal session + real request guard -> actual part/drawing work and review on native PostgreSQL ${title}`;
const partRollback = lifecycle('rolls back a post-formalize failure and then replays the same request exactly once');
const drawingRollback = lifecycle('keeps a minor master Draft, then atomically releases the exact major master after post-formalize rollback and replay');

const fileProtocol = title => `DEV122 F01 actual signed canonical file routes, storage and native worker protocol ${title}`;
export const previewSourceBytesCaseNames = [
  ...['replaced', 'deleted'].map(variant => fileProtocol(`claimed content rejects physically ${variant} source bytes without owned effects`)),
  ...['company', 'kind', 'extension', 'source_hash'].map(variant => fileProtocol(`worker claim excludes native ${variant} source input without effects`)),
  ...['holder', 'provenance'].map(variant => fileProtocol(`claimed content rejects native ${variant} mismatch without storage or DB effects`)),
  fileProtocol('claims once under actual workload authentication, heartbeats and reads source bytes, then completes protocol-only PNG'),
];

export function assertPreviewSourceBytesCoverage(assertions) {
  const nameOf = test => test.fullName || [...(test.ancestorTitles || []), test.title].join(' ');
  const executed = assertions.filter(test => !['pending', 'skipped'].includes(test.status));
  if (previewSourceBytesCaseNames.length !== 9 || executed.length !== 9 ||
      previewSourceBytesCaseNames.some(name => {
        const matches = assertions.filter(test => nameOf(test) === name);
        return matches.length !== 1 || matches[0].status !== 'passed';
      }) ||
      new Set(executed.map(nameOf)).size !== 9 || executed.some(test => !previewSourceBytesCaseNames.includes(nameOf(test)))) {
    throw new Error('DEV122_PREVIEW_SOURCE_BYTES_CASES_MISSING_SKIPPED_FAILED_OR_UNEXPECTED');
  }
}

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

export function evaluateLifecycleCaseCoverage(assertions, { suite, selection }) {
  const required = ['lifecycle', 'all'].includes(suite) && selection === 'suite';
  const nameOf = test => test.fullName || [...(test.ancestorTitles || []), test.title].join(' ');
  const groups = Object.entries(lifecycleCaseGroups).map(([id, names]) => {
    const cases = names.map(name => {
      const statuses = assertions.filter(test => nameOf(test) === name).map(test => test.status);
      return { name, statuses, passed: statuses.length === 1 && statuses[0] === 'passed' };
    });
    return { id, cases, status: cases.every(test => test.passed) ? 'PASS' : 'INCOMPLETE' };
  });
  return {
    required,
    status: required ? groups.every(group => group.status === 'PASS') ? 'PASS' : 'FAIL' : 'NOT_REQUIRED',
    evidenceScope: 'MINIMUM_NATIVE_PARTIAL_EVIDENCE_NOT_GROUP_ACCEPTANCE',
    expectedCaseNames: required ? lifecycleRequiredCaseNames : [],
    groups,
    partial: groups.filter(group => group.cases.some(test => test.passed)).map(group => group.id),
    notRun: ['P-02A save-failure UI', 'P-02C Part readiness HTTP body and mounted UI', 'remaining exact variants in all 29 QA groups'],
  };
}

export function assertLifecycleCaseCoverage(coverage) {
  if (coverage.required && coverage.status !== 'PASS') {
    throw Object.assign(new Error('DEV122_LIFECYCLE_REQUIRED_CASES_MISSING_SKIPPED_FAILED_OR_DUPLICATE'), {
      mismatches: coverage.groups.filter(group => group.status !== 'PASS'),
    });
  }
}
