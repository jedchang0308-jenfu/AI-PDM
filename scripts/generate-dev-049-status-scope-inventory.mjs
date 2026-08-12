#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const SOURCE_ROOTS = ["src/app", "src/components"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const OUTPUT_DIRECTORY = path.join(root, "output", "dev-049-status-scope-inventory");
const JSON_OUTPUT = path.join(OUTPUT_DIRECTORY, "status-scope-inventory.json");
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIRECTORY, "status-scope-inventory.md");

const SIGNALS = [
  { id: "status-column-header", label: "StatusColumnHeader", pattern: /\bStatusColumnHeader\b/gu },
  { id: "status-help-popover", label: "StatusHelpPopover", pattern: /\bStatusHelpPopover\b/gu },
  { id: "status-scope-help", label: "StatusScopeHelp", pattern: /\bStatusScopeHelp\b/gu },
  { id: "status-badge", label: "StatusBadge", pattern: /\bStatusBadge\b/gu },
  { id: "format-status-for-user", label: "formatStatusForUser", pattern: /\bformatStatusForUser\b/gu },
  {
    id: "status-filter",
    label: "status filter / options",
    pattern: /\b(?:statusFilters?|statusOptions|recordStatus|statusFilter)\b/giu
  },
  {
    id: "status-data-label",
    label: "status-bearing data-label",
    pattern: /data-label\s*=\s*["'`][^"'`]*(?:狀態|提醒|審核|發布|準備|檔案|任務|帳號|邀請|還原|效力)[^"'`]*["'`]/gu
  },
  {
    id: "status-axis-label",
    label: "status-axis label",
    pattern: /["'`][^"'`]*(?:資料狀態|申請狀態|審核狀態|發布狀態|準備狀態|檔案狀態|任務狀態|帳號狀態|邀請狀態|還原狀態|號碼效力)[^"'`]*["'`]/gu
  },
  {
    id: "status-property",
    label: "status-bearing property",
    pattern: /\b(?:recordStatus|reviewStatus|publicationStatus|readiness|gdrive_status)\b|\bstatus\s*[:?]/gu
  }
];

const CONTEXT_PATTERN = /\bcontext\s*(?:=|:)\s*["'`]([A-Za-z0-9_-]+)["'`]/gu;

const AXIS_RULES = [
  { axis: "資料狀態", pattern: /masterRecord|recordStatus|資料狀態/iu },
  { axis: "號碼效力", pattern: /numberEffectiveness|號碼效力/iu },
  { axis: "申請狀態", pattern: /applicationStatus|requestStatus|submission|申請狀態|申請中|number-state|numbering[\\/]request|part-drafts/iu },
  { axis: "審核狀態", pattern: /approvalStatus|reviewStatus|approval|review|審核狀態|送審/iu },
  { axis: "發布狀態", pattern: /publicationStatus|releaseStatus|publish|publication|release|發布狀態|正式/iu },
  { axis: "準備狀態", pattern: /readiness|準備狀態/iu },
  { axis: "檔案狀態", pattern: /fileStatus|fileSync|gdrive_status|attachment|檔案狀態|附件/iu },
  { axis: "任務狀態", pattern: /taskStatus|jobStatus|notificationStatus|task|job|任務狀態|待辦/iu },
  { axis: "帳號狀態", pattern: /accountStatus|identityStatus|account|帳號狀態|身分狀態/iu },
  { axis: "邀請狀態", pattern: /invitationStatus|invitation|invite|邀請狀態/iu },
  { axis: "還原狀態", pattern: /restorePolicy|restoreStatus|restore|還原狀態/iu },
  { axis: "提醒", pattern: /warning|notice|reminder|提醒|警示/iu }
];

const EXCEPTION_RULES = [
  {
    kind: "generic-status-context",
    label: "使用 generic status context",
    pattern: /\b(?:context\s*(?:=|:)\s*["'`]generic["'`]|context\s*=\s*["'`]generic["'`])/giu
  },
  {
    kind: "plain-status-label",
    label: "使用單一「狀態」欄名",
    pattern: /(?:label|data-label)\s*=\s*["'`]狀態["'`]|<th>狀態<\/th>/gu
  },
  {
    kind: "raw-english-status-label",
    label: "可能存在可見 raw status 文案",
    pattern: />\s*(?:Draft|Pending|Released|Release|blocker|warning|clear)\s*</gu
  }
];

function toProjectPath(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function walk(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [fullPath] : [];
    });
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function lineAt(source, lineNumber) {
  return source.split(/\r?\n/u)[lineNumber - 1]?.trim().replace(/\s+/gu, " ").slice(0, 220) ?? "";
}

function matchStats(source, pattern, evidenceLimit = 12) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const matches = [];
  let count = 0;
  for (const match of source.matchAll(matcher)) {
    count += 1;
    const line = lineNumberAt(source, match.index ?? 0);
    if (matches.length < evidenceLimit && !matches.some((item) => item.line === line)) {
      matches.push({ line, excerpt: lineAt(source, line) });
    }
  }
  return { count, evidence: matches };
}

function matchesFor(source, pattern, limit = 12) {
  return matchStats(source, pattern, limit).evidence;
}

function routeFromProjectPath(projectPath) {
  if (!projectPath.startsWith("src/app/") || !projectPath.endsWith("/page.tsx")) return null;
  const relative = projectPath.slice("src/app/".length, -"/page.tsx".length);
  if (!relative) return "/";
  const segments = relative.split("/").filter((segment) => !/^\([^/]+\)$/u.test(segment));
  return (
    "/" +
    segments
      .map((segment) => {
        if (/^\[\.\.\.(.+)\]$/u.test(segment)) return `*${segment.slice(4, -1)}`;
        if (/^\[\[\.\.\.(.+)\]\]$/u.test(segment)) return `*${segment.slice(6, -2)}?`;
        if (/^\[(.+)\]$/u.test(segment)) return `:${segment.slice(1, -1)}`;
        return segment;
      })
      .join("/")
  );
}

function contextsFor(source) {
  const contexts = new Set();
  for (const match of source.matchAll(CONTEXT_PATTERN)) contexts.add(match[1]);
  return [...contexts].sort((left, right) => left.localeCompare(right));
}

function axesFor(source, projectPath, route) {
  const scope = `${projectPath}\n${route ?? ""}\n${source}`;
  return AXIS_RULES.filter((rule) => rule.pattern.test(scope)).map((rule) => rule.axis);
}

function exceptionEvidence(source, projectPath, route) {
  const exceptions = [];
  for (const rule of EXCEPTION_RULES) {
    for (const match of matchesFor(source, rule.pattern, 8)) {
      exceptions.push({
        kind: rule.kind,
        label: rule.label,
        file: projectPath,
        route,
        line: match.line,
        excerpt: match.excerpt
      });
    }
  }
  return exceptions;
}

function scanFile(absolutePath) {
  const file = toProjectPath(absolutePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const route = routeFromProjectPath(file);
  const signals = SIGNALS.map((signal) => {
    const stats = matchStats(source, signal.pattern);
    return stats.count > 0
      ? { id: signal.id, label: signal.label, count: stats.count, evidence: stats.evidence }
      : null;
  }).filter(Boolean);
  if (signals.length === 0) return null;

  const contexts = contextsFor(source);
  const columnHelpCount = signals.find((signal) => signal.id === "status-column-header")?.count ?? 0;
  const componentHelpCount = signals.find((signal) => signal.id === "status-help-popover")?.count ?? 0;
  const scopeHelpCount = signals.find((signal) => signal.id === "status-scope-help")?.count ?? 0;
  const exceptions = exceptionEvidence(source, file, route);
  const hasScopeCandidateSignal = signals.some((signal) =>
    ["status-column-header", "status-help-popover", "status-badge", "format-status-for-user", "format-development-phase", "status-filter", "status-data-label", "status-axis-label"].includes(signal.id)
  );
  if (route && hasScopeCandidateSignal && columnHelpCount === 0 && componentHelpCount === 0 && scopeHelpCount === 0) {
    exceptions.push({
      kind: "status-bearing-without-help",
      label: "status-bearing section 尚未使用狀態說明元件",
      file,
      route,
      line: null,
      excerpt: "未找到 StatusColumnHeader、StatusHelpPopover 或 StatusScopeHelp"
    });
  }

  return {
    file,
    kind: route ? "route" : "section",
    ...(route ? { route } : {}),
    signals,
    contexts,
    candidateAxes: axesFor(source, file, route),
    help: {
      columnHeaderCount: columnHelpCount,
      statusHelpPopoverCount: componentHelpCount,
      scopeHelpCount,
      scopeHelpStatus: scopeHelpCount > 0 ? "present" : "not_yet_present"
    },
    exceptions
  };
}

function buildInventory() {
  const sourceFiles = SOURCE_ROOTS.flatMap((relativeRoot) => walk(path.join(root, relativeRoot)));
  const entries = sourceFiles.map(scanFile).filter(Boolean);
  const routes = entries.filter((entry) => entry.kind === "route").sort((left, right) => left.route.localeCompare(right.route) || left.file.localeCompare(right.file));
  const sections = entries.filter((entry) => entry.kind === "section").sort((left, right) => left.file.localeCompare(right.file));
  const exceptions = entries
    .flatMap((entry) => entry.exceptions)
    .sort((left, right) => left.file.localeCompare(right.file) || (left.line ?? 0) - (right.line ?? 0) || left.kind.localeCompare(right.kind));
  const signalCounts = Object.fromEntries(
    SIGNALS.map((signal) => [signal.id, entries.reduce((sum, entry) => sum + (entry.signals.find((item) => item.id === signal.id)?.count ?? 0), 0)])
  );
  const axisCounts = Object.fromEntries(
    AXIS_RULES.map((rule) => [rule.axis, entries.filter((entry) => entry.candidateAxes.includes(rule.axis)).length])
  );

  return {
    schemaVersion: "dev-049-status-scope-inventory.v1",
    task: "DEV-049-1B-01",
    purpose: "盤點 status-bearing route、section 與例外，供 Phase 1B scope registry 使用。",
    sourceRoots: SOURCE_ROOTS,
    safety: {
      mode: "read_only_local_source_scan",
      network: false,
      database: false,
      credentials: false,
      productCodeChanges: false
    },
    scanPolicy: {
      extensions: [...SOURCE_EXTENSIONS].sort(),
      statusSignals: SIGNALS.map((signal) => ({ id: signal.id, label: signal.label })),
      exceptionRules: EXCEPTION_RULES.map((rule) => ({ kind: rule.kind, label: rule.label })),
      notes: [
        "candidateAxes 是依 route、檔名與 source signal 推導的盤點候選，不是 Phase 1B scope registry 的最終契約。",
        "scopeHelpStatus 只辨識 StatusScopeHelp；既有欄位級 StatusColumnHeader / StatusHelpPopover 不等同於資料頂部 scope-level help。",
        "本 scanner 不讀取 DB、API response、audit raw value 或正式環境資料。"
      ]
    },
    summary: {
      sourceFileCount: sourceFiles.length,
      statusBearingFileCount: entries.length,
      routeCount: routes.length,
      sectionCount: sections.length,
      signalCounts,
      axisCounts,
      exceptionCount: exceptions.length
    },
    routes,
    sections,
    exceptions
  };
}

function markdownCell(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderEvidence(entry) {
  return entry.signals
    .flatMap((signal) => signal.evidence.slice(0, 2).map((item) => `  - \`${signal.id}\` L${item.line}: ${item.excerpt}`))
    .slice(0, 10);
}

function renderEntry(entry) {
  const lines = [
    `### ${entry.route ? `\`${entry.route}\`` : `\`${entry.file}\``}`,
    `- 檔案：\`${entry.file}\``,
    `- 類型：${entry.kind === "route" ? "route" : "section"}`,
    `- Signals：${entry.signals.map((signal) => `\`${signal.id}\` ×${signal.count}`).join("、")}`,
    `- Contexts：${entry.contexts.length > 0 ? entry.contexts.map((context) => `\`${context}\``).join("、") : "（未直接找到 context）"}`,
    `- 候選狀態軸：${entry.candidateAxes.length > 0 ? entry.candidateAxes.join("、") : "（待人工判定）"}`,
    `- Help：欄位級 ${entry.help.columnHeaderCount}；StatusHelpPopover ${entry.help.statusHelpPopoverCount}；scope-level ${entry.help.scopeHelpStatus}`
  ];
  const evidence = renderEvidence(entry);
  if (evidence.length > 0) lines.push("- 代表證據：", ...evidence);
  return lines.join("\n");
}

function renderMarkdown(inventory) {
  const lines = [
    "# DEV-049 Phase 1B-0：Status Scope Inventory",
    "",
    `- 任務：\`${inventory.task}\``,
    `- Schema：\`${inventory.schemaVersion}\``,
    `- 來源：${inventory.sourceRoots.map((item) => `\`${item}\``).join("、")}`,
    "- 執行模式：唯讀、離線、只產出本 inventory artifact",
    "",
    "## Summary",
    "",
    "| 指標 | 數值 |",
    "| --- | ---: |",
    `| 掃描 source files | ${inventory.summary.sourceFileCount} |`,
    `| status-bearing files | ${inventory.summary.statusBearingFileCount} |`,
    `| routes | ${inventory.summary.routeCount} |`,
    `| sections | ${inventory.summary.sectionCount} |`,
    `| exceptions | ${inventory.summary.exceptionCount} |`,
    "",
    "### Signal counts",
    "",
    "| Signal | 次數 |",
    "| --- | ---: |",
    ...Object.entries(inventory.summary.signalCounts).map(([key, value]) => `| \`${key}\` | ${value} |`),
    "",
    "### Candidate axis coverage",
    "",
    "| 狀態軸 | 涉及檔案數 |",
    "| --- | ---: |",
    ...Object.entries(inventory.summary.axisCounts).map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## Status-bearing routes",
    "",
    ...inventory.routes.flatMap((entry) => [renderEntry(entry), ""]),
    "## Status-bearing sections",
    "",
    ...inventory.sections.flatMap((entry) => [renderEntry(entry), ""]),
    "## Exceptions",
    "",
    "以下是 scanner 依規則標出的待 registry / rollout 判定項目；它們不是本階段自動修復清單。",
    "",
    "| 類型 | 檔案 | route | 行 | 摘要 |",
    "| --- | --- | --- | ---: | --- |",
    ...inventory.exceptions.map((item) => `| \`${item.kind}\` | \`${item.file}\` | ${markdownCell(item.route ?? "section")} | ${item.line ?? "-"} | ${markdownCell(item.excerpt)} |`),
    "",
    "## Next handoff",
    "",
    "- 以本 inventory 作為 `DEV-049-1B-02` scope registry 的輸入；registry 需人工確認 route / section / title / axes / contexts / exceptions。",
    "- 本 artifact 不代表已完成 `StatusScopeHelp`、頁面 rollout、raw status 改名或 browser QC。",
    "- 建議重跑：`npm.cmd run inventory:dev-049-status-scope`。"
  ];
  return `${lines.join("\n").replace(/\n{3,}/gu, "\n\n").trim()}\n`;
}

const inventory = buildInventory();
fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
fs.writeFileSync(JSON_OUTPUT, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
fs.writeFileSync(MARKDOWN_OUTPUT, renderMarkdown(inventory), "utf8");

console.log(`DEV-049 Phase 1B-0 status scope inventory: ${inventory.summary.statusBearingFileCount} status-bearing files`);
console.log(`Routes: ${inventory.summary.routeCount}; sections: ${inventory.summary.sectionCount}; exceptions: ${inventory.summary.exceptionCount}`);
console.log(`JSON: ${toProjectPath(JSON_OUTPUT)}`);
console.log(`Markdown: ${toProjectPath(MARKDOWN_OUTPUT)}`);
