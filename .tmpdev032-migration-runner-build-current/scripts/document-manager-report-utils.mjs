import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getReportRoot } from "./pdm-paths.mjs";

export const DOCUMENT_MANAGER_SCHEMA_VERSION = 3;

export const DOCUMENT_MANAGER_CASES = [
  { id: "DM-LIC-001", section: "License And Component", priority: "P0", required: true, expected: "SolidWorks Document Manager or equivalent component source is identified." },
  { id: "DM-LIC-002", section: "License And Component", priority: "P0", required: true, expected: "License key/account ownership and renewal path are documented without exposing secrets." },
  { id: "DM-DEP-001", section: "Deployment", priority: "P0", required: true, expected: "Extractor binary or wrapper is installed on the target Web/Windows host." },
  { id: "DM-DEP-002", section: "Deployment", priority: "P0", required: true, expected: "`PDM_METADATA_EXTRACTOR_CMD` points to the deployed extractor." },
  { id: "DM-DEP-003", section: "Deployment", priority: "P1", required: true, expected: "`PDM_METADATA_EXTRACTOR_ARGS` or default argument contract is documented." },
  { id: "DM-DEP-004", section: "Deployment", priority: "P1", required: true, expected: "`PDM_CAD_REFERENCE_EXTRACTOR_CMD` and args contract are documented if references use a separate extractor." },
  { id: "DM-META-001", section: "Native Metadata", priority: "P0", required: true, expected: "Sample `.sldprt` extracts all required PDM metadata fields without sidecar." },
  { id: "DM-META-002", section: "Native Metadata", priority: "P0", required: true, expected: "Sample `.sldasm` extracts all required PDM metadata fields without sidecar." },
  { id: "DM-META-003", section: "Native Metadata", priority: "P0", required: true, expected: "Sample `.slddrw` extracts all required PDM metadata fields without sidecar." },
  { id: "DM-REF-001", section: "Native References", priority: "P0", required: true, expected: "Sample assembly returns component references through the CAD reference adapter or approved equivalent." },
  { id: "DM-REF-002", section: "Native References", priority: "P0", required: true, expected: "Sample drawing returns model reference through the CAD reference adapter or approved equivalent." },
  { id: "DM-API-001", section: "Web Upload Integration", priority: "P0", required: true, expected: "`POST /api/file-metadata/detect` records native metadata source in `nativeMetadataFiles`." },
  { id: "DM-API-002", section: "Web Upload Integration", priority: "P0", required: true, expected: "Native CAD metadata wins over filename fallback when no sidecar is present." },
  { id: "DM-FAIL-001", section: "Failure And Security", priority: "P0", required: true, expected: "Extractor failure returns a clear warning and does not block sidecar/filename fallback." },
  { id: "DM-SEC-001", section: "Failure And Security", priority: "P0", required: true, expected: "Temporary CAD files are deleted after extraction." }
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
    schemaVersion: DOCUMENT_MANAGER_SCHEMA_VERSION,
    reportId,
    status: "draft",
    environment: {
      tester: "",
      testDate: "",
      componentName: "",
      componentVersion: "",
      licenseOwner: "",
      deploymentHost: "",
      extractorCommand: "",
      extractorArgs: "",
      referenceExtractorCommand: "",
      referenceExtractorArgs: "",
      extractorProbePath: "",
      backendUrl: "",
      sampleFilesPath: ""
    },
    summary: {
      finalResult: "not_ready",
      signedOffBy: "",
      signedOffAt: "",
      notes: ""
    },
    cases: DOCUMENT_MANAGER_CASES.map((testCase) => ({
      ...testCase,
      result: "not_run",
      evidence: "",
      notes: "",
      sampleFile: "",
      backendSubmissionId: ""
    })),
    findings: []
  };
}

export function normalizeReport(input) {
  const report = structuredClone(input ?? {});
  const blank = createBlankReport(report.reportId || makeReportId());
  report.schemaVersion = DOCUMENT_MANAGER_SCHEMA_VERSION;
  report.reportId ||= blank.reportId;
  report.status ||= blank.status;
  report.environment = { ...blank.environment, ...(report.environment ?? {}) };
  report.summary = { ...blank.summary, ...(report.summary ?? {}) };
  report.findings = Array.isArray(report.findings) ? report.findings : [];

  const casesById = new Map((Array.isArray(report.cases) ? report.cases : []).map((testCase) => [testCase.id, testCase]));
  const normalizedCases = DOCUMENT_MANAGER_CASES.map((expectedCase) => {
    const actualCase = casesById.get(expectedCase.id) ?? {};
    return {
      ...expectedCase,
      ...actualCase,
      section: expectedCase.section,
      priority: expectedCase.priority,
      required: expectedCase.required,
      expected: expectedCase.expected,
      result: actualCase.result ?? "not_run",
      evidence: actualCase.evidence ?? "",
      notes: actualCase.notes ?? "",
      sampleFile: actualCase.sampleFile ?? "",
      backendSubmissionId: actualCase.backendSubmissionId ?? ""
    };
  });

  const knownIds = new Set(DOCUMENT_MANAGER_CASES.map((testCase) => testCase.id));
  const customCases = (Array.isArray(report.cases) ? report.cases : []).filter((testCase) => testCase.id && !knownIds.has(testCase.id));
  report.cases = [...normalizedCases, ...customCases];

  return report;
}

export function buildReportMarkdown(input) {
  const report = normalizeReport(input);
  const lines = [
    "# SolidWorks Document Manager / Equivalent Component Evidence Report",
    "",
    `Report ID: \`${report.reportId}\``,
    "",
    "## Fill-In Instructions",
    "",
    "1. Fill `report.json` after the licensed component or equivalent extractor is deployed.",
    "2. Use `pass`, `fail`, `blocked`, or `not_run` for each case result.",
    "3. All required cases must be `pass` before related `PDM_dev_task.md` P0 items can be checked.",
    "4. Do not paste license keys or secrets into this report.",
    "",
    "## Environment",
    "",
    "| Field | Value |",
    "| --- | --- |"
  ];

  for (const [key, value] of Object.entries(report.environment)) {
    lines.push(`| ${key} | ${value === null ? "" : value} |`);
  }

  const groups = report.cases.reduce((acc, testCase) => {
    acc[testCase.section] ??= [];
    acc[testCase.section].push(testCase);
    return acc;
  }, {});

  for (const [section, cases] of Object.entries(groups)) {
    lines.push("", `## ${section}`, "", "| Case ID | Priority | Required | Result | Evidence | Sample File | Backend Submission | Notes |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const testCase of cases) {
      lines.push(
        `| ${testCase.id} | ${testCase.priority} | ${testCase.required ? "Yes" : "No"} | ${testCase.result} | ${testCase.evidence} | ${testCase.sampleFile} | ${testCase.backendSubmissionId} | ${testCase.notes || testCase.expected} |`
      );
    }
  }

  lines.push(
    "",
    "## Sign-Off",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| finalResult | ${report.summary.finalResult} |`,
    `| signedOffBy | ${report.summary.signedOffBy} |`,
    `| signedOffAt | ${report.summary.signedOffAt} |`,
    `| notes | ${report.summary.notes} |`,
    ""
  );

  return lines.join("\n");
}

export function findLatestReport(root) {
  const reportRoot = getReportRoot(root, "document-manager-reports");
  if (!existsSync(reportRoot)) return null;

  const reports = [];
  for (const entry of readdirSync(reportRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const reportPath = path.join(reportRoot, entry.name, "report.json");
    if (existsSync(reportPath)) reports.push(reportPath);
  }

  return reports.sort().at(-1) ?? null;
}

export function readReport(reportPath) {
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

export function writeReport(reportPath, report) {
  const normalizedReport = normalizeReport(report);
  writeFileSync(reportPath, `${JSON.stringify(normalizedReport, null, 2)}\n`, "utf8");
  writeFileSync(reportPath.replace(/\.json$/u, ".md"), buildReportMarkdown(normalizedReport), "utf8");
}

export function validateReport(report) {
  report = normalizeReport(report);
  const issues = [];
  const requiredEnvironmentFields = [
    "tester",
    "testDate",
    "componentName",
    "componentVersion",
    "licenseOwner",
    "deploymentHost",
    "extractorCommand",
    "extractorProbePath",
    "backendUrl",
    "sampleFilesPath"
  ];

  for (const field of requiredEnvironmentFields) {
    if (!String(report.environment?.[field] ?? "").trim()) {
      issues.push({ type: "missing_environment", field });
    }
  }

  if (report.summary?.finalResult !== "pass") {
    issues.push({ type: "summary_not_pass", field: "summary.finalResult", actual: report.summary?.finalResult ?? null });
  }

  if (!String(report.summary?.signedOffBy ?? "").trim()) {
    issues.push({ type: "missing_signoff", field: "summary.signedOffBy" });
  }

  const probePath = String(report.environment?.extractorProbePath ?? "").trim();
  if (probePath) {
    const resolvedProbePath = path.isAbsolute(probePath) ? probePath : path.join(process.cwd(), probePath);
    if (!existsSync(resolvedProbePath)) {
      issues.push({ type: "probe_not_found", field: "environment.extractorProbePath", actual: probePath });
    } else {
      try {
        const probe = JSON.parse(readFileSync(resolvedProbePath, "utf8"));
        if (probe.ready !== true) {
          issues.push({ type: "probe_not_ready", field: "environment.extractorProbePath", actual: probe.ready ?? null });
        }
      } catch (error) {
        issues.push({ type: "probe_invalid_json", field: "environment.extractorProbePath", actual: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const casesById = new Map((report.cases ?? []).map((testCase) => [testCase.id, testCase]));
  for (const expectedCase of DOCUMENT_MANAGER_CASES) {
    const actualCase = casesById.get(expectedCase.id);
    if (!actualCase) {
      issues.push({ type: "missing_case", caseId: expectedCase.id });
      continue;
    }

    if (expectedCase.required && actualCase.result !== "pass") {
      issues.push({ type: "required_case_not_pass", caseId: expectedCase.id, priority: expectedCase.priority, actual: actualCase.result });
    }
  }

  for (const finding of report.findings ?? []) {
    if (["P0", "P1"].includes(finding.severity) && !["closed", "accepted"].includes(finding.status)) {
      issues.push({ type: "open_finding", findingId: finding.id ?? "", severity: finding.severity, status: finding.status });
    }
  }

  const totalCases = DOCUMENT_MANAGER_CASES.length;
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
