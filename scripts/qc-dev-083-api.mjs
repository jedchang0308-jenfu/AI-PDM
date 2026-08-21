#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const expect = (name, condition) => checks.push({ name, condition: Boolean(condition) });
const part = read("src/lib/part-workbench.ts");
const relation = read("src/lib/relation-workbench.ts");
const partRepo = read("src/lib/repositories/part-workbench-async-repository.ts");
const relationRepo = read("src/lib/repositories/relation-workbench-async-repository.ts");
const cursor = read("src/lib/pdm-workbench-cursor.ts");
const approval = read("src/lib/pdm-approval-owner-route.ts");
const action = read("src/lib/pdm-detail-action-resolver.ts");
expect("cursor remains signed", cursor.includes("timingSafeEqual") && cursor.includes("filterHash"));
expect("part accepts before direction", part.includes('direction: "after" | "before"') && partRepo.includes("cursorDirection === \"before\""));
expect("relation accepts before direction", relation.includes('direction: "after" | "before"') && relationRepo.includes("cursorDirection === \"before\""));
expect("previous cursor signed from first row", part.includes("previousCursor") && relation.includes("previousCursor") && part.includes('direction: "before"') && relation.includes('direction: "before"'));
expect("reviewer owner is exact request route", approval.includes("/approvals/${encodeURIComponent(item.id)}") && !approval.includes("/numbering/search?"));
expect("drawer actions navigate rather than command", action.includes("workspaceNavigationHref") && !action.includes("function command(") && action.includes('navigate(`/approvals/${encodeURIComponent(review.requestId)}'));
expect("reviewer target is server re-read", read("src/components/approval-request-workspace.tsx").includes("resolvePdmApprovalOwnerContext") && read("src/components/approval-request-workspace.tsx").includes("reviewRequestId=${encodeURIComponent(requestId)}"));
for (const check of checks) console.log(`${check.condition ? "PASS" : "FAIL"} ${check.name}`);
if (checks.some((check) => !check.condition)) process.exitCode = 1;
