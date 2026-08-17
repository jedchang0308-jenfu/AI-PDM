#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const context = fs.readFileSync("src/lib/bom-create-context.ts", "utf8");
const detailRoute = fs.readFileSync("src/app/api/bom/drafts/[draftId]/route.ts", "utf8");
const editorPage = fs.readFileSync("src/app/bom/workbench/page.tsx", "utf8");
const xmindEditor = fs.readFileSync("src/components/bom-editor/bom-xmind-editor.tsx", "utf8");
const mutationRoutes = [
  "src/app/api/bom/drafts/[draftId]/active/route.ts",
  "src/app/api/bom/drafts/[draftId]/delete/route.ts",
  "src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts",
  "src/app/api/bom/drafts/[draftId]/reconfirm-replacements/route.ts",
  "src/app/api/bom/drafts/[draftId]/restore/route.ts"
].map((path) => fs.readFileSync(path, "utf8"));

assert.match(context, /isBomReleasedOnlyRole\(user\)[\s\S]*draft\.status === "Released"[\s\S]*canAccessCompany/);
assert.match(context, /export async function canManageBomDraftRecordAsync[\s\S]*isBomReleasedOnlyRole\(user\)\) return false/);
assert.match(detailRoute, /accessCapability:\s*\{ releasedReadOnly: isBomReleasedOnlyRole\(auth\.user\) \}/);
assert.match(editorPage, /onRequestObsolete=\{releasedReadOnly \? undefined : requestObsolete\}/);
assert.match(editorPage, /onCloneDraft=\{releasedReadOnly \? undefined : cloneDraft\}/);
assert.match(xmindEditor, /draft\.status === "Released" && onRequestObsolete/);
for (const route of mutationRoutes) assert.match(route, /canManageBomDraftRecordAsync/);

console.log("QC DEV-074 BOM released-role visibility: PASS (Manufacturing/Procurement can read Released BOMs while lifecycle mutations remain blocked)");
