import fs from "node:fs";
import path from "node:path";

export const RESTORE_DRILL_CASES = [
  {
    id: "RESTORE-ENV-001",
    section: "Independent Test Machine Environment",
    priority: "P0",
    required: true,
    expected: "Restore drill is executed on a machine that is not the production/source machine."
  },
  {
    id: "RESTORE-ENV-002",
    section: "Independent Test Machine Environment",
    priority: "P1",
    required: true,
    expected: "Node.js, npm, and project dependencies are available on the test machine."
  },
  {
    id: "RESTORE-SNAP-001",
    section: "Backup Snapshot Verification",
    priority: "P0",
    required: true,
    expected: "Backup snapshot manifest verification returns valid=true."
  },
  {
    id: "RESTORE-SNAP-002",
    section: "Backup Snapshot Verification",
    priority: "P0",
    required: true,
    expected: "Snapshot checksum verification reports no missing, size mismatch, or hash mismatch files."
  },
  {
    id: "RESTORE-RUN-001",
    section: "Restore Execution",
    priority: "P0",
    required: true,
    expected: "restore-on-test-machine.ps1 or backup:restore exits with code 0."
  },
  {
    id: "RESTORE-RUN-002",
    section: "Restore Execution",
    priority: "P0",
    required: true,
    expected: "Restored SQLite database passes PRAGMA integrity_check."
  },
  {
    id: "RESTORE-RUN-003",
    section: "Restore Execution",
    priority: "P0",
    required: true,
    expected: "Restored repository files are present and linked to restored DB rows."
  },
  {
    id: "RESTORE-APP-001",
    section: "Restored App Verification",
    priority: "P0",
    required: true,
    expected: "npm.cmd run build exits 0 using restored data paths."
  },
  {
    id: "RESTORE-APP-002",
    section: "Restored App Verification",
    priority: "P0",
    required: true,
    expected: "npm.cmd run smoke exits 0 using restored data paths."
  },
  {
    id: "RESTORE-APP-003",
    section: "Restored App Verification",
    priority: "P0",
    required: true,
    expected: "npm.cmd run qc:api exits 0 using restored data paths."
  },
  {
    id: "RESTORE-APP-004",
    section: "Restored App Verification",
    priority: "P0",
    required: true,
    expected: "npm.cmd run qc:file-hashes reports 0 issues using restored data paths."
  },
  {
    id: "RESTORE-EVID-001",
    section: "Evidence And Sign-Off",
    priority: "P1",
    required: true,
    expected: "Operator records command transcript, restored target path, and readiness report output."
  }
];

export function makeRestoreDrillReportId(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

export function createBlankRestoreDrillReport(reportId = makeRestoreDrillReportId()) {
  return {
    schemaVersion: 1,
    reportId,
    status: "draft",
    environment: {
      tester: "",
      testDate: "",
      testMachineName: "",
      testMachineType: "independent",
      windowsVersion: "",
      nodeVersion: "",
      npmVersion: "",
      sourceSnapshotId: "",
      sourceSnapshotPath: "",
      handoffPath: "",
      targetDir: "",
      productionMachineName: ""
    },
    summary: {
      finalResult: "not_ready",
      signedOffBy: "",
      signedOffAt: "",
      notes: ""
    },
    cases: RESTORE_DRILL_CASES.map((testCase) => ({
      ...testCase,
      result: "not_run",
      evidence: "",
      notes: "",
      command: ""
    })),
    findings: []
  };
}

export function getRestoreDrillReportRoot(root = process.cwd()) {
  return path.join(root, "data", "restore-drill-reports");
}

export function findLatestRestoreDrillReport(root = process.cwd()) {
  const reportRoot = getRestoreDrillReportRoot(root);
  if (!fs.existsSync(reportRoot)) return null;

  const reports = [];
  for (const entry of fs.readdirSync(reportRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const reportPath = path.join(reportRoot, entry.name, "report.json");
    if (fs.existsSync(reportPath)) reports.push(reportPath);
  }

  return reports.sort().at(-1) ?? null;
}

export function readRestoreDrillReport(reportPath) {
  return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}

function isFilled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateRestoreDrillReport(report) {
  const issues = [];
  const requiredEnvironmentFields = [
    "tester",
    "testDate",
    "testMachineName",
    "testMachineType",
    "windowsVersion",
    "nodeVersion",
    "npmVersion",
    "sourceSnapshotId",
    "sourceSnapshotPath",
    "handoffPath",
    "targetDir"
  ];

  for (const field of requiredEnvironmentFields) {
    if (!isFilled(report.environment?.[field])) {
      issues.push({ type: "missing_environment", field });
    }
  }

  if (String(report.environment?.testMachineType ?? "").trim().toLowerCase() !== "independent") {
    issues.push({
      type: "invalid_environment",
      field: "testMachineType",
      expected: "independent",
      actual: report.environment?.testMachineType ?? null
    });
  }

  if (
    isFilled(report.environment?.productionMachineName) &&
    isFilled(report.environment?.testMachineName) &&
    String(report.environment.productionMachineName).trim().toLowerCase() ===
      String(report.environment.testMachineName).trim().toLowerCase()
  ) {
    issues.push({ type: "same_machine", field: "testMachineName", expected: "different from productionMachineName" });
  }

  if (report.summary?.finalResult !== "pass") {
    issues.push({ type: "summary_not_pass", field: "summary.finalResult", actual: report.summary?.finalResult ?? null });
  }

  if (!isFilled(report.summary?.signedOffBy)) {
    issues.push({ type: "missing_signoff", field: "summary.signedOffBy" });
  }

  const casesById = new Map((report.cases ?? []).map((testCase) => [testCase.id, testCase]));
  for (const expectedCase of RESTORE_DRILL_CASES) {
    const actualCase = casesById.get(expectedCase.id);
    if (!actualCase) {
      issues.push({ type: "missing_case", caseId: expectedCase.id });
      continue;
    }

    if (expectedCase.required && actualCase.result !== "pass") {
      issues.push({
        type: "required_case_not_pass",
        caseId: expectedCase.id,
        priority: expectedCase.priority,
        actual: actualCase.result
      });
    }

    if (actualCase.result === "pass" && !isFilled(actualCase.evidence)) {
      issues.push({ type: "missing_case_evidence", caseId: expectedCase.id });
    }
  }

  for (const finding of report.findings ?? []) {
    if (["P0", "P1"].includes(finding.severity) && !["closed", "accepted"].includes(finding.status)) {
      issues.push({ type: "open_finding", findingId: finding.id ?? "", severity: finding.severity, status: finding.status });
    }
  }

  const totalCases = RESTORE_DRILL_CASES.length;
  const passedCases = (report.cases ?? []).filter((testCase) => testCase.result === "pass").length;

  return {
    ready: issues.length === 0,
    reportId: report.reportId ?? "",
    status: report.status ?? "",
    totalCases,
    passedCases,
    issues
  };
}

export function getRestoreDrillReportEvidence(root = process.cwd()) {
  const reportPath = findLatestRestoreDrillReport(root);
  if (!reportPath) {
    return {
      ready: false,
      reportPath: null,
      issues: [{ type: "missing_report" }]
    };
  }

  return {
    ...validateRestoreDrillReport(readRestoreDrillReport(reportPath)),
    reportPath
  };
}
