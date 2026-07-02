#!/usr/bin/env node

import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

const dropzone = readProjectFile(root, "src/components/file-dropzone.tsx");
const uploadPage = readProjectFile(root, "src/app/upload/page.tsx");
const bomWorkbench = readProjectFile(root, "src/app/bom/workbench/page.tsx");
const masterAttachmentPanel = readProjectFile(root, "src/components/master-attachment-panel.tsx");
const css = readProjectFile(root, "src/app/globals.css");
const packageJson = readProjectJson(root, "package.json");
const spec = readProjectFile(root, ".ai-doc/specs/SPEC-UX-FILE-DROPZONE-001-system-upload-drag-drop.md");

assert(dropzone.includes("export function FileDropzone"), "FileDropzone component exists");
assert(dropzone.includes("single_file_only"), "FileDropzone rejects multiple files in single-file mode");
assert(dropzone.includes("onDragOver") && dropzone.includes("onDrop"), "FileDropzone handles drag/drop events");
assert(dropzone.includes("type=\"file\"") && dropzone.includes("multiple={multiple}"), "FileDropzone owns native file input");
assert(dropzone.includes("disabled") && dropzone.includes("onReject"), "FileDropzone supports disabled and reject callbacks");

assert(uploadPage.includes("FileDropzone"), "Upload page uses FileDropzone");
assert(uploadPage.includes("multiple") && uploadPage.includes("handleFiles(selected)"), "Upload page keeps multiple file flow");
assert(!uploadPage.includes("setDragOver"), "Upload page no longer owns duplicate drag state");

assert(bomWorkbench.includes("FileDropzone"), "BOM workbench uses FileDropzone");
assert(bomWorkbench.includes('accept=".xls,.xlsx,.csv,.tsv,.txt,.html"'), "BOM dropzone limits spreadsheet-like files");
assert(bomWorkbench.includes("single_file_only") && bomWorkbench.includes("BOM XLS 匯入一次只能選擇一個檔案"), "BOM dropzone rejects multi-file drops");
assert(!bomWorkbench.includes("fileInputRef"), "BOM workbench removed hidden file input ref");

assert(masterAttachmentPanel.includes("FileDropzone"), "Master attachment panel uses FileDropzone");
assert(masterAttachmentPanel.includes("selectedFile={file}"), "Master attachment panel shows selected single file");
assert(masterAttachmentPanel.includes("此區一次只能上傳一個附件"), "Master attachment panel rejects multi-file drops");

for (const marker of [
  ".file-dropzone",
  ".file-dropzone.compact",
  ".file-dropzone.drag-over",
  ".file-dropzone.disabled",
  ".file-dropzone-chip"
]) {
  assert(css.includes(marker), `Global CSS includes ${marker}`);
}

assert(spec.includes("SPEC-UX-FILE-DROPZONE-001") && spec.includes("全系統拖曳上傳 UX"), "Spec document exists");
assert(spec.includes("DEV-UX-FILE-DROPZONE-001"), "Spec records DEV-UX-FILE-DROPZONE-001 linkage");
assert(spec.includes("qc:file-dropzone-ux"), "Spec records file dropzone QC evidence");
assert(packageJson.scripts?.["qc:file-dropzone-ux"] === "node scripts/qc-file-dropzone-ux.mjs", "package script qc:file-dropzone-ux is registered");

console.log(`qc:file-dropzone-ux passed ${checks.length}/${checks.length} checks`);
