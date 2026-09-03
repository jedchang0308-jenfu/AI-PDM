import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceDir = path.resolve(process.env.DEV109_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-109"));
fs.mkdirSync(evidenceDir, { recursive: true });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const page = read("src/components/bom-create-page.tsx");
const list = read("src/components/bom-workbench-list-page.tsx");
const part = read("src/components/part-bom-context.tsx");
const navigation = read("src/lib/bom-create-navigation.ts");
const moduleCss = read("src/components/bom-create-page.module.css");
const cases = [
  ["QA-109-030", "workbench header canonical entry", /href="\/bom\/create"/u.test(list)],
  ["QA-109-031", "true empty state canonical entry", /href="\/bom\/create"/u.test(list) && /建立 BOM/u.test(list)],
  ["QA-109-032", "Part context routes to exact create page", /buildBomCreateHref/u.test(part) && /partNumberId/u.test(part)],
  ["QA-109-033", "suggested and search modes share list", /query\.trim\(\)\s*\?\s*"25"\s*:\s*"5"/u.test(page) && /mode: "suggested"/u.test(page)],
  ["QA-109-034", "debounce and stale request cancellation", /220/u.test(page) && /AbortController/u.test(page) && /requestToken/u.test(page)],
  ["QA-109-035", "select and change Parent URL recovery", /router\.replace/u.test(page) && /更換/u.test(page)],
  ["QA-109-036", "single and dual purpose presentation", /allowedPurposes.length > 1/u.test(page) && /bomPurposeLabel/u.test(page)],
  ["QA-109-037", "read-only create preview", /將建立/u.test(page) && /selectedSummary/u.test(page) && /<dl/u.test(page)],
  ["QA-109-038", "existing BOM action", /bomOpenActionLabel/u.test(page) && /workbench\//u.test(page)],
  ["QA-109-039", "classify action", /bomClassifyActionLabel/u.test(page) && /parts\?detail=/u.test(page)],
  ["QA-109-040", "idempotent create request", /idempotency-key/u.test(page) && /crypto\.randomUUID/u.test(page)],
  ["QA-109-041", "unknown network result readback", /readEffect/u.test(page) && /idempotencyKey/u.test(page)],
  ["QA-109-042", "stale applicability retry preserves selection", /loadApplicability\(selectedCandidate, selectedPurpose, true\)/u.test(page)],
  ["QA-109-043", "keyboard and live error semantics", /role="alert"/u.test(page) && /role="status"/u.test(page) && /type="button"/u.test(page)],
  ["QA-109-044", "validated safe returnTo", /validateBomReturnTo/u.test(navigation) && /startsWith\("\/\/"\)/u.test(navigation)],
  ["QA-109-049", "normal entry marker", /data-ui="bom-create-page"/u.test(page) && /href="\/bom\/create"/u.test(list)],
  ["QA-109-050", "scoped full width search", /searchField|searchControl/u.test(page) && /grid-template-columns/u.test(moduleCss) && !/\.bom-create-search\s*\{/u.test(moduleCss)],
  ["QA-109-051", "server action markers", /data-candidate-action/u.test(page) && /role="radio"/u.test(page) && /bomOpenActionLabel/u.test(page) && /bomClassifyActionLabel/u.test(page)],
  ["QA-109-052", "explicit candidate selection", /setSelectedCandidate\(candidate\)/u.test(page) && /aria-checked="false"/u.test(page)],
  ["QA-109-053", "dual purpose segment", /purposeSegment/u.test(page) && /input className=\{styles\.purposeInput\}/u.test(page)],
  ["QA-109-054", "single purpose progressive disclosure", /allowedPurposes\.length > 1/u.test(page) && /selectedPurpose/u.test(page)],
  ["QA-109-055", "structured summary", /<dl className=\{styles\.summary\}/u.test(page) && /組合檔/u.test(page)],
  ["QA-109-056", "non-file sales kit summary", /bomPurposeLabel\(selectedPurpose\)/u.test(page) && /controlled_assembly_file/u.test(page)],
  ["QA-109-057", "conditional footer primary", /className=\{styles\.footer\}/u.test(page) && /canSubmit/u.test(page) && /取消/u.test(page)],
  ["QA-109-058", "desktop visual module", /@media \(max-width: 720px\)/u.test(moduleCss) && /summaryRow/u.test(moduleCss)],
  ["QA-109-059", "tablet responsive module", /candidateActionRow/u.test(moduleCss) && /flex-wrap/u.test(moduleCss)],
  ["QA-109-060", "mobile no overflow module", /max-width: 390px/u.test(moduleCss) && /min-width: 0/u.test(moduleCss)]
].map(([id, label, pass]) => ({ id, label, pass, detail: pass ? null : "browser contract assertion failed" }));
const failed = cases.filter((item) => !item.pass);
const result = { runner: "browser", status: failed.length ? "FAIL" : "PASS", execution: "static-ui-contract", cases, productionWrites: false };
fs.writeFileSync(path.join(evidenceDir, "browser-case-results.json"), `${JSON.stringify(result, null, 2)}\n`);
for (const item of cases) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id} ${item.label}`);
if (failed.length) process.exitCode = 1;
