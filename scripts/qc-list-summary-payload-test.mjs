const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const token = Date.now().toString().slice(-6);
const results = [];

const forbiddenSummaryFields = [
  "item_id",
  "product_line",
  "customer",
  "project_code",
  "process_name",
  "machine",
  "change_description",
  "approval_required",
  "rejected_at",
  "reject_reason",
  "release_error",
  "superseded_by_submission_id",
  "obsolete_at",
  "obsolete_by"
];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`login ${email}`, response.ok, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function createSubmission(cookie) {
  const form = new FormData();
  form.set("drawing_number", `SUMMARY-${token}`);
  form.set("part_number", `P-SUMMARY-${token}`);
  form.set("part_name", "Summary payload seed");
  form.set("revision", "A");
  form.set("product_line", `SummaryLine-${token}`);
  form.set("customer", `SummaryCustomer-${token}`);
  form.set("project_code", `SummaryProject-${token}`);
  form.set("process_name", `SummaryProcess-${token}`);
  form.set("machine", `SummaryMachine-${token}`);
  form.set("material", `SummaryMaterial-${token}`);
  form.set("surface_finish", `SummaryFinish-${token}`);
  form.set("document_type", "Drawing");
  form.set("change_description", `Long detail-only change description ${token} `.repeat(20).slice(0, 100));
  form.append("files", new File([Buffer.from("summary payload placeholder")], `SUMMARY-${token}.pdf`, { type: "application/pdf" }));
  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  record("SUMMARY setup submission created", response.status === 201, `HTTP ${response.status}`);
  return body.submissionId;
}

function assertSummaryShape(prefix, row) {
  const keys = Object.keys(row ?? {});
  for (const field of forbiddenSummaryFields) {
    record(`${prefix} omits ${field}`, !keys.includes(field), `keys ${keys.join(",")}`);
  }
  for (const field of ["id", "drawing_number", "revision", "part_number", "part_name", "status", "file_count", "file_roles", "created_at", "updated_at"]) {
    record(`${prefix} includes table field ${field}`, keys.includes(field), `keys ${keys.join(",")}`);
  }
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");
  const submissionId = await createSubmission(engineerCookie);

  const listResponse = await fetch(`${baseUrl}/api/submissions?limit=1&status=Pending`, { headers: { cookie: managerCookie } });
  const listText = await listResponse.text();
  const listBody = JSON.parse(listText);
  record("SUMMARY-001 list API returns 200", listResponse.ok, `HTTP ${listResponse.status}`);
  const listRow = listBody.submissions?.find((submission) => submission.id === submissionId) ?? listBody.submissions?.[0];
  assertSummaryShape("SUMMARY-002 list row", listRow);
  record("SUMMARY-003 list response stays compact", listText.length < 6000, `bytes ${listText.length}`);

  const searchResponse = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(`SUMMARY-${token}`)}`, { headers: { cookie: managerCookie } });
  const searchBody = await searchResponse.json().catch(() => ({}));
  record("SUMMARY-004 search API returns seeded row", searchBody.submissions?.some((submission) => submission.id === submissionId));
  const searchRow = searchBody.submissions?.find((submission) => submission.id === submissionId);
  assertSummaryShape("SUMMARY-005 search row", searchRow);

  const detailResponse = await fetch(`${baseUrl}/api/submissions/${submissionId}`, { headers: { cookie: managerCookie } });
  const detailBody = await detailResponse.json().catch(() => ({}));
  record("SUMMARY-006 detail API returns 200", detailResponse.ok, `HTTP ${detailResponse.status}`);
  record("SUMMARY-007 detail still includes change_description", detailBody.submission?.change_description?.includes(token));
  record("SUMMARY-008 detail still includes finder metadata", detailBody.submission?.product_line === `SummaryLine-${token}`);

  console.log(JSON.stringify({ passed: results.length, failed: 0, token, results }, null, 2));
}

run().catch((error) => {
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ passed: results.length - failed, failed, token, results, error: error.message }, null, 2));
  process.exit(1);
});
