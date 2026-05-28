import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const root = process.cwd();
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: demoPassword })
  });
  if (!response.ok) throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function makeForm(input) {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (key !== "filename") form.set(key, String(value));
  }
  form.append("files", new File([Buffer.from(`revision lifecycle ${input.revision}`)], input.filename, { type: "application/pdf" }));
  return form;
}

async function postSubmission(input, cookie) {
  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie },
    body: makeForm(input)
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function approve(submissionId, cookie) {
  const response = await fetch(`${baseUrl}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ comment: "QC revision lifecycle approval" })
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function getStoredState(firstId, secondId, partNumber) {
  const db = new Database(dbPath);
  try {
    const first = db.prepare("SELECT status, superseded_by_submission_id, obsolete_at FROM submissions WHERE id = ?").get(firstId);
    const second = db.prepare("SELECT status FROM submissions WHERE id = ?").get(secondId);
    const item = db.prepare("SELECT current_revision FROM items WHERE part_number = ?").get(partNumber);
    return { first, second, item };
  } finally {
    db.close();
  }
}

async function main() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");
  const token = `${Date.now().toString().slice(-6)}${Math.random().toString(16).slice(2, 6)}`;
  const drawingNumber = `QC-REVOBS-${token}`;
  const partNumber = `P-QC-REVOBS-${token}`;
  const filename = `${drawingNumber}.pdf`;

  const baseData = {
    drawing_number: drawingNumber,
    part_number: partNumber,
    part_name: "QC Revision Lifecycle Part",
    material: "S45C",
    surface_finish: "Black Oxide",
    document_type: "Drawing",
    change_description: "QC revision lifecycle"
  };

  const firstSubmission = await postSubmission({ ...baseData, revision: "A", filename }, engineerCookie);
  record("REVOBS-001 Rev A submission returns 201", firstSubmission.response.status === 201, `HTTP ${firstSubmission.response.status}`);

  const firstId = firstSubmission.body.submissionId;
  const firstApproval = await approve(firstId, managerCookie);
  record("REVOBS-002 Rev A release returns Released", firstApproval.body.status === "Released", JSON.stringify(firstApproval.body));

  let state = getStoredState(firstId, firstId, partNumber);
  record("REVOBS-003 current item revision is Rev A after Rev A release", state.item?.current_revision === "A", JSON.stringify(state.item));

  const shareBeforeResponse = await fetch(`${baseUrl}/api/submissions/${firstId}/shares`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ label: "QC obsolete share", days: 7 })
  });
  const shareBeforeBody = await shareBeforeResponse.json().catch(() => ({}));
  record("REVOBS-007 Manager can create public share for Rev A before Rev B release", shareBeforeResponse.status === 201, `HTTP ${shareBeforeResponse.status}`);

  const secondSubmission = await postSubmission({ ...baseData, revision: "B", filename }, engineerCookie);
  record("REVOBS-004 Rev B same item and filename submission returns 201", secondSubmission.response.status === 201, `HTTP ${secondSubmission.response.status}`);

  const secondId = secondSubmission.body.submissionId;
  state = getStoredState(firstId, secondId, partNumber);
  record("REVOBS-005 Rev B Pending does not obsolete Rev A", state.first?.status === "Released" && state.second?.status === "Pending", JSON.stringify(state));
  record("REVOBS-006 current item revision remains Rev A while Rev B is Pending", state.item?.current_revision === "A", JSON.stringify(state.item));

  const secondApproval = await approve(secondId, managerCookie);
  record("REVOBS-008 Rev B release returns Released and obsoletes Rev A", secondApproval.body.status === "Released" && secondApproval.body.lifecycle?.obsolete_count >= 1, JSON.stringify(secondApproval.body));

  state = getStoredState(firstId, secondId, partNumber);
  record(
    "REVOBS-009 Rev A status becomes Obsolete and points to Rev B",
    state.first?.status === "Obsolete" && state.first?.superseded_by_submission_id === secondId && Boolean(state.first?.obsolete_at),
    JSON.stringify(state.first)
  );
  record("REVOBS-010 current item revision becomes Rev B", state.item?.current_revision === "B", JSON.stringify(state.item));

  const obsoletePackageResponse = await fetch(`${baseUrl}/api/submissions/${firstId}/release-package`, { headers: { cookie: managerCookie } });
  record("REVOBS-011 internal Rev A package download still returns 200", obsoletePackageResponse.status === 200, `HTTP ${obsoletePackageResponse.status}`);

  const publicShareAfterResponse = await fetch(`${baseUrl}/api/public/shares/${shareBeforeBody.token}`);
  record("REVOBS-012 Rev A public share returns 404 after obsolete", publicShareAfterResponse.status === 404, `HTTP ${publicShareAfterResponse.status}`);

  const obsoleteShareCreateResponse = await fetch(`${baseUrl}/api/submissions/${firstId}/shares`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ label: "QC obsolete share blocked", days: 7 })
  });
  record("REVOBS-013 creating a new share for Rev A returns 409", obsoleteShareCreateResponse.status === 409, `HTTP ${obsoleteShareCreateResponse.status}`);

  const obsoleteSyncResponse = await fetch(`${baseUrl}/api/integrations/procurement/sync-runs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ submissionId: firstId, targetSystem: "procurement" })
  });
  record("REVOBS-014 procurement sync for Rev A returns 409", obsoleteSyncResponse.status === 409, `HTTP ${obsoleteSyncResponse.status}`);

  const handoffResponse = await fetch(`${baseUrl}/api/handoff`, { headers: { cookie: managerCookie } });
  const handoffBody = await handoffResponse.json().catch(() => ({}));
  const handoffIds = new Set((handoffBody.entries ?? []).map((entry) => entry.id));
  record("REVOBS-015 handoff includes Rev B and excludes Rev A", handoffIds.has(secondId) && !handoffIds.has(firstId), JSON.stringify([...handoffIds]));

  const procurementResponse = await fetch(`${baseUrl}/api/integrations/procurement/releases?partNumber=${encodeURIComponent(partNumber)}`, {
    headers: { cookie: managerCookie }
  });
  const procurementBody = await procurementResponse.json().catch(() => ({}));
  const procurementIds = new Set((procurementBody.entries ?? []).map((entry) => entry.submission_id));
  record("REVOBS-016 procurement releases include Rev B and exclude Rev A", procurementIds.has(secondId) && !procurementIds.has(firstId), JSON.stringify([...procurementIds]));

  const revisionHistoryResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(partNumber)}/revisions`, {
    headers: { cookie: managerCookie }
  });
  const revisionHistoryBody = await revisionHistoryResponse.json().catch(() => ({}));
  const obsoleteHistory = (revisionHistoryBody.revisions ?? []).find((entry) => entry.submission_id === firstId);
  record(
    "REVOBS-017 revision history shows Rev A as Obsolete with Rev B as superseding submission",
    obsoleteHistory?.status === "Obsolete" && obsoleteHistory?.superseded_by_submission_id === secondId,
    JSON.stringify(obsoleteHistory)
  );

  const obsoleteSearchResponse = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(drawingNumber)}&status=Obsolete`, {
    headers: { cookie: managerCookie }
  });
  const obsoleteSearchBody = await obsoleteSearchResponse.json().catch(() => ({}));
  const obsoleteSearchIds = new Set((obsoleteSearchBody.submissions ?? []).map((entry) => entry.id));
  record("REVOBS-018 search with status=Obsolete finds Rev A", obsoleteSearchIds.has(firstId), JSON.stringify([...obsoleteSearchIds]));

  const releasedSearchResponse = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(drawingNumber)}&status=Released`, {
    headers: { cookie: managerCookie }
  });
  const releasedSearchBody = await releasedSearchResponse.json().catch(() => ({}));
  const releasedSearchIds = new Set((releasedSearchBody.submissions ?? []).map((entry) => entry.id));
  record("REVOBS-019 search with status=Released finds Rev B and excludes Rev A", releasedSearchIds.has(secondId) && !releasedSearchIds.has(firstId), JSON.stringify([...releasedSearchIds]));

  const ragData = fs.readFileSync(path.join(root, "src", "lib", "pdm-policy-rag-data.ts"), "utf8");
  record(
    "REVOBS-020 policy RAG data includes Obsolete lifecycle rules",
    ragData.includes("Obsolete") && ragData.includes("current_revision") && ragData.includes("採購同步"),
    "policy rag lifecycle keywords"
  );
}

try {
  await main();
} catch (error) {
  record("REVOBS-000 test runner completed without unexpected exception", false, error instanceof Error ? error.stack ?? error.message : String(error));
}

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` :: ${result.detail}` : ""}`);
}

const failed = results.filter((result) => !result.passed);
if (failed.length > 0) {
  console.error(`Revision lifecycle QC failed: ${failed.length}/${results.length}`);
  process.exit(1);
}

console.log(`Revision lifecycle QC passed: ${results.length}/${results.length}`);
