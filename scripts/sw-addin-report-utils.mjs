import fs from "node:fs";
import path from "node:path";

export const SW_ADDIN_CASES = [
  { id: "SW-INST-001", section: "Installation And Registration", priority: "P0", required: true, expected: "Build/install completes without error." },
  { id: "SW-INST-002", section: "Installation And Registration", priority: "P0", required: true, expected: "SolidWorks Add-ins list shows AI PDM Add-in." },
  { id: "SW-INST-003", section: "Installation And Registration", priority: "P0", required: true, expected: "Add-in loads without crash." },
  { id: "SW-INST-004", section: "Installation And Registration", priority: "P0", required: true, expected: "AI PDM submit command is visible and clickable." },
  { id: "SW-INST-005", section: "Installation And Registration", priority: "P1", required: true, expected: "Add-in unloads and reloads without leaving duplicate buttons." },
  { id: "SW-AUTH-001", section: "Authentication And Local Security", priority: "P0", required: true, expected: "Login window opens." },
  { id: "SW-AUTH-002", section: "Authentication And Local Security", priority: "P0", required: true, expected: "Login succeeds and submission window opens." },
  { id: "SW-AUTH-003", section: "Authentication And Local Security", priority: "P1", required: true, expected: "Token is reused unless invalid." },
  { id: "SW-AUTH-004", section: "Authentication And Local Security", priority: "P0", required: true, expected: "Token file exists and is not plain readable text." },
  { id: "SW-AUTH-005", section: "Authentication And Local Security", priority: "P1", required: true, expected: "Token is removed locally after logout." },
  { id: "SW-AUTH-006", section: "Authentication And Local Security", priority: "P0", required: true, expected: "Invalid login fails and no token is stored." },
  { id: "SW-AUTH-007", section: "Authentication And Local Security", priority: "P0", required: true, expected: "No Google service account key is present on the CAD machine." },
  { id: "SW-META-001", section: "Metadata Extraction And Validation", priority: "P0", required: true, expected: "Part properties are extracted correctly." },
  { id: "SW-META-002", section: "Metadata Extraction And Validation", priority: "P0", required: true, expected: "Assembly properties are extracted correctly." },
  { id: "SW-META-003", section: "Metadata Extraction And Validation", priority: "P0", required: true, expected: "Drawing properties are extracted correctly." },
  { id: "SW-META-004", section: "Metadata Extraction And Validation", priority: "P0", required: true, expected: "Missing properties block submission before upload." },
  { id: "SW-META-005", section: "Metadata Extraction And Validation", priority: "P0", required: true, expected: "Unsaved document is blocked before upload." },
  { id: "SW-META-006", section: "Metadata Extraction And Validation", priority: "P1", required: true, expected: "document_type is auto-filled from SolidWorks type." },
  { id: "SW-FILE-001", section: "File Collection And Export", priority: "P0", required: true, expected: "Part upload includes one native .sldprt file." },
  { id: "SW-FILE-002", section: "File Collection And Export", priority: "P0", required: true, expected: "Assembly upload includes one native .sldasm file." },
  { id: "SW-FILE-003", section: "File Collection And Export", priority: "P0", required: true, expected: "Drawing upload includes native .slddrw, exported .pdf, and exported .dwg." },
  { id: "SW-FILE-004", section: "File Collection And Export", priority: "P0", required: true, expected: "Temporary exported files are removed after success." },
  { id: "SW-FILE-005", section: "File Collection And Export", priority: "P0", required: true, expected: "Temporary exported files are removed after upload failure." },
  { id: "SW-FILE-006", section: "File Collection And Export", priority: "P1", required: true, expected: "Oversized file is blocked or fails with a clear file-size error." },
  { id: "SW-FILE-007", section: "File Collection And Export", priority: "P1", required: false, expected: "Unsupported file type is rejected if reachable." },
  { id: "SW-SUB-001", section: "Submission Workflow", priority: "P0", required: true, expected: "Valid part reaches backend Pending." },
  { id: "SW-SUB-002", section: "Submission Workflow", priority: "P0", required: true, expected: "Valid drawing with approval_required=1 is created correctly." },
  { id: "SW-SUB-003", section: "Submission Workflow", priority: "P0", required: true, expected: "Valid drawing with approval_required=2 creates two-reviewer workflow." },
  { id: "SW-SUB-004", section: "Submission Workflow", priority: "P1", required: true, expected: "Short change description disables submit." },
  { id: "SW-SUB-005", section: "Submission Workflow", priority: "P1", required: true, expected: "Long change description disables submit." },
  { id: "SW-SUB-006", section: "Submission Workflow", priority: "P1", required: true, expected: "Numbers-only or symbols-only change description disables submit." },
  { id: "SW-SUB-007", section: "Submission Workflow", priority: "P0", required: true, expected: "Duplicate drawing_number + revision is rejected without orphan file." },
  { id: "SW-SUB-008", section: "Submission Workflow", priority: "P0", required: true, expected: "New submission appears in Pending on Web dashboard." },
  { id: "SW-SUB-009", section: "Submission Workflow", priority: "P0", required: true, expected: "Web detail records SHA256, file size, and file location." },
  { id: "SW-FAIL-001", section: "Failure And Recovery", priority: "P0", required: true, expected: "Unreachable backend shows network error and does not crash." },
  { id: "SW-FAIL-002", section: "Failure And Recovery", priority: "P0", required: true, expected: "Backend stop during upload shows failure and cleans temp files." },
  { id: "SW-FAIL-003", section: "Failure And Recovery", priority: "P0", required: true, expected: "Expired token returns auth error and requires login." },
  { id: "SW-FAIL-004", section: "Failure And Recovery", priority: "P1", required: true, expected: "Unavailable temp folder reports error without crashing." },
  { id: "SW-FAIL-005", section: "Failure And Recovery", priority: "P0", required: true, expected: "Backend policy rejection is shown and no high-privilege credential is created." },
  { id: "SW-LOG-001", section: "Logs And Evidence", priority: "P1", required: true, expected: "Log contains collection/upload success." },
  { id: "SW-LOG-002", section: "Logs And Evidence", priority: "P0", required: true, expected: "Failure log does not expose password or token." },
  { id: "SW-LOG-003", section: "Logs And Evidence", priority: "P1", required: false, expected: "Old logs are not kept indefinitely if available." }
];

export function makeReportId(date = new Date()) {
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

export function createBlankReport(reportId = makeReportId()) {
  return {
    schemaVersion: 1,
    reportId,
    status: "draft",
    environment: {
      tester: "",
      testDate: "",
      windowsVersion: "",
      solidWorksVersion: "",
      dotNet48Installed: null,
      backendUrl: "",
      testAccount: "",
      testMachineType: "",
      addinBuildPath: "",
      addinVersion: ""
    },
    summary: {
      finalResult: "not_ready",
      signedOffBy: "",
      signedOffAt: "",
      notes: ""
    },
    cases: SW_ADDIN_CASES.map((testCase) => ({
      ...testCase,
      result: "not_run",
      evidence: "",
      notes: "",
      backendSubmissionId: ""
    })),
    findings: []
  };
}

export function validateReport(report) {
  const issues = [];
  const requiredEnvironmentFields = [
    "tester",
    "testDate",
    "windowsVersion",
    "solidWorksVersion",
    "backendUrl",
    "testAccount",
    "testMachineType",
    "addinBuildPath"
  ];

  for (const field of requiredEnvironmentFields) {
    if (!String(report.environment?.[field] ?? "").trim()) {
      issues.push({ type: "missing_environment", field });
    }
  }

  if (report.environment?.dotNet48Installed !== true) {
    issues.push({ type: "missing_environment", field: "dotNet48Installed", expected: true });
  }

  if (report.summary?.finalResult !== "pass") {
    issues.push({ type: "summary_not_pass", field: "summary.finalResult", actual: report.summary?.finalResult ?? null });
  }

  if (!String(report.summary?.signedOffBy ?? "").trim()) {
    issues.push({ type: "missing_signoff", field: "summary.signedOffBy" });
  }

  const casesById = new Map((report.cases ?? []).map((testCase) => [testCase.id, testCase]));
  for (const expectedCase of SW_ADDIN_CASES) {
    const actualCase = casesById.get(expectedCase.id);
    if (!actualCase) {
      issues.push({ type: "missing_case", caseId: expectedCase.id });
      continue;
    }

    const result = actualCase.result;
    if (expectedCase.required && result !== "pass") {
      issues.push({ type: "required_case_not_pass", caseId: expectedCase.id, priority: expectedCase.priority, actual: result });
    }

    if (!expectedCase.required && !["pass", "not_applicable"].includes(result)) {
      issues.push({ type: "optional_case_unresolved", caseId: expectedCase.id, actual: result });
    }
  }

  for (const finding of report.findings ?? []) {
    if (["P0", "P1"].includes(finding.severity) && !["closed", "accepted"].includes(finding.status)) {
      issues.push({ type: "open_finding", findingId: finding.id ?? "", severity: finding.severity, status: finding.status });
    }
  }

  const totalCases = SW_ADDIN_CASES.length;
  const passedCases = (report.cases ?? []).filter((testCase) => testCase.result === "pass").length;
  const notApplicableCases = (report.cases ?? []).filter((testCase) => testCase.result === "not_applicable").length;

  return {
    ready: issues.length === 0,
    reportId: report.reportId ?? "",
    status: report.status ?? "",
    totalCases,
    passedCases,
    notApplicableCases,
    issues
  };
}

export function findLatestReport(root) {
  const reportRoot = path.join(root, "data", "sw-addin-test-reports");
  if (!fs.existsSync(reportRoot)) return null;

  const reports = [];
  for (const entry of fs.readdirSync(reportRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const reportPath = path.join(reportRoot, entry.name, "report.json");
    if (fs.existsSync(reportPath)) {
      reports.push(reportPath);
    }
  }

  return reports.sort().at(-1) ?? null;
}

export function readReport(reportPath) {
  return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}
