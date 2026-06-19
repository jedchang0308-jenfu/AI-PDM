import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const requiredFiles = [
  '.ai-doc/reports/pm/pm-sw-license-pdm-company-operational-shared-development-plan-2026-06-18.md',
  '.ai-doc/specs/SPEC-SW-LICENSE-PDM-001-operational-shared-company-scope.md',
  '.ai-doc/decisions/ADR-SW-LICENSE-PDM-001-operational-shared.md',
  '.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md',
  '.ai-doc/documentation_map.md',
  'scripts/qc-sw-license-pdm-company-scope.mjs',
  'scripts/qc-sw-license-pdm-numbering-company-scope.mjs',
  'scripts/qc-sw-license-pdm-metadata-adapter-profile.mjs',
  'scripts/qc-sw-license-pdm-git-boundary.mjs',
  'scripts/qc-sw-addin-company-selection.mjs',
];

const requiredPackageScripts = [
  'qc:sw-license-pdm-company-scope',
  'qc:sw-license-pdm-numbering-company-scope',
  'qc:sw-license-pdm-metadata-adapter-profile',
  'qc:sw-license-pdm-git-boundary',
  'qc:sw-addin-company-selection',
];

const cleanIndexCandidateFiles = [
  '.ai-doc/reports/pm/pm-sw-license-pdm-company-operational-shared-development-plan-2026-06-18.md',
  '.ai-doc/specs/SPEC-SW-LICENSE-PDM-001-operational-shared-company-scope.md',
  '.ai-doc/decisions/ADR-SW-LICENSE-PDM-001-operational-shared.md',
  '.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md',
  '.ai-doc/documentation_map.md',
  'package.json',
  'scripts/qc-sw-license-pdm-company-scope.mjs',
  'scripts/qc-sw-license-pdm-numbering-company-scope.mjs',
  'scripts/qc-sw-license-pdm-metadata-adapter-profile.mjs',
  'scripts/qc-sw-license-pdm-git-boundary.mjs',
  'scripts/qc-sw-addin-company-selection.mjs',
  'src/lib/company-context.ts',
  'src/lib/numbering-company-context.ts',
  'src/lib/metadata-adapter-profile.ts',
  'src/lib/numbering-async.ts',
  'src/lib/repositories/numbering-async-repository.ts',
];

const expectedUnrelatedStaged = [
  '.ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md',
  '.ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md',
  '.ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md',
  '.ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md',
  'scripts/qc-supabase-gate-b-staging-validation.mjs',
  'scripts/qc-supabase-runtime-gate-plan.mjs',
  'scripts/qc-supabase-runtime-local-readiness.mjs',
  'scripts/qc-supabase-runtime-smoke-report.mjs',
  'scripts/qc-supabase-target-identity-receipt.mjs',
];

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

const failures = [];
const notes = [];

for (const path of requiredFiles) {
  if (!existsSync(path)) {
    failures.push(`missing required file: ${path}`);
  }
}

const packageJson = JSON.parse(read('package.json'));
for (const scriptName of requiredPackageScripts) {
  if (!packageJson.scripts?.[scriptName]) {
    failures.push(`missing package script: ${scriptName}`);
  }
}

const stagedFiles = git(['diff', '--cached', '--name-only']);
const stagedSet = new Set(stagedFiles);
const stagedUnrelated = expectedUnrelatedStaged.filter((path) => stagedSet.has(path));

if (stagedUnrelated.length === 0) {
  notes.push('no unrelated Supabase staged files detected in the real index');
} else {
  notes.push(`detected unrelated staged files: ${stagedUnrelated.length}`);
}

const handoffPath = '.ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md';
const handoff = existsSync(handoffPath) ? read(handoffPath) : '';
for (const path of stagedUnrelated) {
  if (!handoff.includes(path)) {
    failures.push(`handoff does not document staged unrelated file: ${path}`);
  }
}

for (const phrase of [
  'Git boundary deferred',
  'Group A: SW/PDM 公司隔離文件',
  'Group B: SW/PDM 公司隔離 source',
  'Group C: SW/PDM 公司隔離 QC',
  '明確排除',
]) {
  if (!handoff.includes(phrase)) {
    failures.push(`handoff missing section or phrase: ${phrase}`);
  }
}

const docMap = existsSync('.ai-doc/documentation_map.md') ? read('.ai-doc/documentation_map.md') : '';
if (!docMap.includes('Implemented SW License / PDM Company Package')) {
  failures.push('documentation_map does not mark SW/PDM package as implemented/deferred');
}
if (!docMap.includes(handoffPath)) {
  failures.push('documentation_map does not link the git boundary handoff');
}

const devTask = existsSync('.ai-doc/dev_task.md') ? read('.ai-doc/dev_task.md') : '';
const boundaryClosed =
  devTask.includes('6f4dbab') &&
  devTask.includes('DEV-SW-LICENSE-PDM-001 add company-scoped PDM boundary') &&
  devTask.includes('be333eb') &&
  devTask.includes('DEV-SUPABASE-DB-001 record staging gate B evidence');

if (boundaryClosed) {
  notes.push('dev_task records closed SW/PDM commit boundary and separate Supabase evidence commit');
} else if (!devTask.includes('existing unrelated Supabase staged files')) {
  failures.push('dev_task does not document either the closed commit boundary or the prior unrelated staged-file boundary');
}

const tempIndex = join(
  tmpdir(),
  `ai-pdm-sw-pdm-boundary-${Date.now()}-${Math.random().toString(16).slice(2)}.index`,
);
if (boundaryClosed) {
  notes.push('clean-index simulation skipped because the scoped SW/PDM commit is already closed');
} else {
  try {
    const env = { ...process.env, GIT_INDEX_FILE: tempIndex };
    git(['read-tree', 'HEAD'], { env });
    for (const path of cleanIndexCandidateFiles) {
      git(['add', '--', path], { env });
    }
    const cleanCandidate = git(['diff', '--cached', '--name-only'], { env });
    const cleanCandidateSet = new Set(cleanCandidate);
    const leakedUnrelated = expectedUnrelatedStaged.filter((path) => cleanCandidateSet.has(path));
    if (leakedUnrelated.length > 0) {
      failures.push(`clean-index simulation leaked unrelated staged files: ${leakedUnrelated.join(', ')}`);
    }
    for (const path of cleanIndexCandidateFiles) {
      if (!cleanCandidateSet.has(path)) {
        failures.push(`clean-index simulation missing candidate file: ${path}`);
      }
    }
    notes.push(`clean-index candidate files: ${cleanCandidate.length}`);
  } finally {
    rmSync(tempIndex, { force: true });
  }
}

if (failures.length > 0) {
  console.error('QC SW/PDM git boundary: FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('QC SW/PDM git boundary: PASS');
for (const note of notes) {
  console.log(`- ${note}`);
}
if (stagedUnrelated.length === 0) {
  if (boundaryClosed) {
    console.log('- direct commit boundary is already closed for the SW/PDM group');
  } else {
    console.log('- direct commit boundary can close for the current staged SW/PDM group');
  }
} else {
  console.log('- direct commit remains intentionally deferred until index cleanup or explicit PM grouping approval');
}
