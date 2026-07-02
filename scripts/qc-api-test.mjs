import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const root = process.cwd();
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const repositoryPath = path.join(root, "data", "repository");
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const qcStorageAuditRunId = `qc-api-${Date.now().toString(36)}`;
const qcStorageAuditHeaderName = "x-ai-pdm-qc-storage-audit-run-id";
const qcStorageAuditHeaders = { [qcStorageAuditHeaderName]: qcStorageAuditRunId };
const expectedStorageAuditSource = process.env.PDM_QC_EXPECT_STORAGE_AUDIT_SOURCE === "runtime" ? "runtime" : "qc_api";

function storageAuditHasExpectedProvenance(audit) {
  if (!audit?.detail) return false;
  if (expectedStorageAuditSource === "runtime") {
    return audit.detail.storageAccessSource === "runtime" && audit.detail.qcRunId === null;
  }
  return audit.detail.storageAccessSource === "qc_api" && audit.detail.qcRunId === qcStorageAuditRunId;
}

function ensureTestUser(input) {
  const db = new Database(dbPath);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, display_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(input.id, input.displayName, input.email, input.role, now, now);
  db.close();
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: demoPassword })
  });
  if (!response.ok) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

ensureTestUser({
  id: "user-engineer-qc-2",
  displayName: "QC Engineer 2",
  email: "engineer2@example.com",
  role: "Engineer"
});

const engineerCookie = await login("engineer@example.com");
const engineer2Cookie = await login("engineer2@example.com");
const managerCookie = await login("manager@example.com");
const adminCookie = await login("admin@example.com");

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else {
      results.push(path.resolve(fullPath));
    }
  }
  return results;
}

function findOrphanRepositoryFiles() {
  const db = new Database(dbPath);
  const tracked = new Set(
    db
      .prepare("SELECT local_path FROM submission_files")
      .all()
      .map((row) => path.resolve(row.local_path).toLowerCase())
  );
  db.close();

  return walkFiles(repositoryPath).filter((filePath) => !tracked.has(path.resolve(filePath).toLowerCase()));
}

function getConversationMessageCount(conversationId) {
  const db = new Database(dbPath);
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM llm_messages WHERE conversation_id = ?")
    .get(conversationId);
  db.close();
  return row?.count ?? 0;
}

function getStorageAccessAudits(submissionId) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .prepare(
        `SELECT id, actor_id, detail_json, created_at
         FROM audit_logs
         WHERE submission_id = ? AND action = 'StorageAccessed'
         ORDER BY created_at ASC, id ASC`
      )
      .all(submissionId)
      .map((row) => {
        let detail = {};
        try {
          detail = JSON.parse(String(row.detail_json ?? "{}"));
        } catch {
          detail = {};
        }
        return { ...row, detail };
      });
  } finally {
    db.close();
  }
}

function seedAssemblyReferences(submissionId, children) {
  const db = new Database(dbPath);
  const sourceFile = db.prepare("SELECT id, original_filename, file_role FROM submission_files WHERE submission_id = ? LIMIT 1").get(submissionId);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO file_references (
      id, submission_id, source_file_id, source_filename, source_file_role,
      referenced_filename, referenced_part_number, referenced_drawing_number,
      referenced_revision, reference_type, quantity, extraction_method, confidence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const child of children) {
    insert.run(
      crypto.randomUUID(),
      submissionId,
      sourceFile?.id ?? null,
      sourceFile?.original_filename ?? "assembly.sldasm",
      sourceFile?.file_role ?? "sldasm",
      child.filename,
      child.partNumber,
      child.drawingNumber ?? child.partNumber,
      child.revision ?? null,
      "assembly_component",
      child.quantity ?? 1,
      "qc_seed",
      "high",
      now
    );
  }
  db.close();
}

function makeForm(overrides = {}, withFile = true) {
  const unique = Date.now().toString().slice(-6) + Math.random().toString(16).slice(2, 6);
  const data = {
    drawing_number: `QC-${unique}`,
    part_number: `P-QC-${unique}`,
    part_name: "QC Test Part",
    revision: "A",
    material: "S45C",
    surface_finish: "Black Oxide",
    document_type: "Drawing",
    change_description: "Change hole size for fixture test",
    ...overrides
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(data)) {
    form.set(key, value);
  }
  if (withFile) {
    form.append("files", new File([Buffer.from("qc pdf placeholder")], `${data.drawing_number}.pdf`, { type: "application/pdf" }));
  }
  return { form, data };
}

function makeFormWithFile(file, overrides = {}) {
  const { form, data } = makeForm(overrides, false);
  form.append("files", file);
  return { form, data };
}

async function postSubmission(overrides = {}, withFile = true, cookie = engineerCookie) {
  const { form, data } = makeForm(overrides, withFile);
  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, data };
}

async function postSubmissionWithFile(file, overrides = {}, cookie = engineerCookie, cadReferences = []) {
  const { form, data } = makeFormWithFile(file, overrides);
  if (cadReferences.length > 0) {
    form.set("cad_references_json", JSON.stringify(cadReferences));
  }
  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body, data };
}

async function approveSubmission(submissionId, cookie = managerCookie, comment = "QC approve") {
  const response = await fetch(`${baseUrl}/api/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ comment })
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function postChat(message, context = {}, cookie = managerCookie, conversationId = "") {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message, context, conversationId })
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function getNotifications(cookie) {
  const response = await fetch(`${baseUrl}/api/notifications`, { headers: { cookie } });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function expectStatus(name, actual, expected) {
  const passed = actual === expected;
  return { name, passed, actual, expected };
}

const results = [];

const unauthList = await fetch(`${baseUrl}/api/submissions?status=Pending`);
results.push(await expectStatus("AUTH-001 unauthenticated submissions list returns 401", unauthList.status, 401));

const unauthSettings = await fetch(`${baseUrl}/api/settings`);
results.push(await expectStatus("AUTH-008 unauthenticated settings returns 401", unauthSettings.status, 401));

const engineerSettings = await fetch(`${baseUrl}/api/settings`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("AUTH-009 Engineer settings returns 403", engineerSettings.status, 403));

const managerSettings = await fetch(`${baseUrl}/api/settings`, {
  headers: { cookie: managerCookie }
});
results.push(await expectStatus("AUTH-010 Manager settings returns 403", managerSettings.status, 403));

const adminSettings = await fetch(`${baseUrl}/api/settings`, {
  headers: { cookie: adminCookie }
});
results.push(await expectStatus("AUTH-011 Admin settings returns 200", adminSettings.status, 200));

const unauthChat = await fetch(`${baseUrl}/api/chat`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message: "summary" })
});
results.push(await expectStatus("AUTH-012 unauthenticated chat returns 401", unauthChat.status, 401));

const unauthSearch = await fetch(`${baseUrl}/api/search?q=QC`);
results.push(await expectStatus("AUTH-013 unauthenticated search returns 401", unauthSearch.status, 401));

const unauthNotifications = await fetch(`${baseUrl}/api/notifications`);
results.push(await expectStatus("NOTIFY-001 unauthenticated notifications returns 401", unauthNotifications.status, 401));

const nativeMetadataForm = new FormData();
nativeMetadataForm.append(
  "files",
  new File(
    [
      Buffer.from(
        'mock solidworks bytes\nAI_PDM_METADATA:{"drawing_number":"QC-NATIVE-001","part_number":"P-QC-NATIVE-001","part_name":"Native Adapter Part","revision":"B","material":"SKD11","surface_finish":"Nitrided","document_type":"Part"}'
          + '\nAI_PDM_REFERENCES:[{"referencedFilename":"QC-NATIVE-CHILD-001.sldprt","referencedPartNumber":"P-QC-NATIVE-CHILD-001","referencedDrawingNumber":"QC-NATIVE-CHILD-001","referencedRevision":"A","referenceType":"assembly_component","quantity":2,"extractionMethod":"embedded_native_reference","confidence":"high"}]'
      )
    ],
    "QC-NATIVE-FALLBACK-RevA.sldasm",
    { type: "application/octet-stream" }
  )
);
const nativeMetadataResponse = await fetch(`${baseUrl}/api/file-metadata/detect`, {
  method: "POST",
  headers: { cookie: engineerCookie },
  body: nativeMetadataForm
});
const nativeMetadataBody = await nativeMetadataResponse.json().catch(() => ({}));
results.push(await expectStatus("META-001 native CAD metadata adapter returns 200", nativeMetadataResponse.status, 200));
results.push(await expectStatus("META-002 native CAD metadata has high priority drawing number", nativeMetadataBody.metadata?.drawing_number, "QC-NATIVE-001"));
results.push(await expectStatus("META-003 native CAD metadata has high priority revision", nativeMetadataBody.metadata?.revision, "B"));
results.push(
  await expectStatus(
    "META-004 native CAD metadata source is recorded",
    nativeMetadataBody.nativeMetadataFiles?.some((source) => String(source).includes("embedded-native-metadata")) ?? false,
    true
  )
);
results.push(await expectStatus("CADREF-001 native CAD reference adapter returns one reference", nativeMetadataBody.cadReferences?.length ?? 0, 1));
results.push(
  await expectStatus(
    "CADREF-002 native CAD reference adapter keeps child part number",
    nativeMetadataBody.cadReferences?.[0]?.referencedPartNumber,
    "P-QC-NATIVE-CHILD-001"
  )
);
results.push(await expectStatus("CADREF-003 native CAD reference adapter keeps quantity", nativeMetadataBody.cadReferences?.[0]?.quantity, 2));
results.push(
  await expectStatus(
    "CADREF-004 native CAD reference adapter avoids not-configured warning",
    nativeMetadataBody.warnings?.some((warning) => String(warning).includes("native file references are not extracted")) ?? false,
    false
  )
);

results.push(await expectStatus("API-002 missing drawing_number returns 400", (await postSubmission({ drawing_number: "" })).status, 400));
results.push(await expectStatus("API-003 missing part_number returns 400", (await postSubmission({ part_number: "" })).status, 400));
results.push(await expectStatus("API-004 no files returns 400", (await postSubmission({}, false)).status, 400));
results.push(await expectStatus("API-006 numeric change description returns 400", (await postSubmission({ change_description: "12345" })).status, 400));
results.push(
  await expectStatus(
    "API-007 unsupported file type returns 400",
    (await postSubmissionWithFile(new File([Buffer.from("not allowed")], "blocked.exe", { type: "application/octet-stream" }))).status,
    400
  )
);
results.push(
  await expectStatus(
    "API-008 oversized file returns 400",
    (
      await postSubmissionWithFile(
        new File([Buffer.alloc(50 * 1024 * 1024 + 1)], "oversized.pdf", { type: "application/pdf" }),
        { drawing_number: `QC-BIG-${Date.now().toString().slice(-6)}`, part_number: `P-QC-BIG-${Date.now().toString().slice(-6)}` }
      )
    ).status,
    400
  )
);

const duplicateSeed = await postSubmission({
  drawing_number: `QC-DUP-${Date.now().toString().slice(-6)}`,
  revision: "A"
});
results.push(await expectStatus("API-001 positive submission returns 201", duplicateSeed.status, 201));

const managerNotifications = await getNotifications(managerCookie);
results.push(await expectStatus("NOTIFY-002 manager notifications returns 200", managerNotifications.status, 200));
results.push(
  await expectStatus(
    "NOTIFY-003 manager notifications include pending review",
    managerNotifications.body.notifications?.some(
      (notification) => notification.kind === "pending_review" && notification.submission_id === duplicateSeed.body.submissionId
    ) ?? false,
    true
  )
);

const engineerNotifications = await getNotifications(engineerCookie);
results.push(await expectStatus("NOTIFY-004 engineer notifications returns 200", engineerNotifications.status, 200));
results.push(
  await expectStatus(
    "NOTIFY-005 engineer notifications include own awaiting review",
    engineerNotifications.body.notifications?.some(
      (notification) => notification.kind === "awaiting_review" && notification.submission_id === duplicateSeed.body.submissionId
    ) ?? false,
    true
  )
);

const managerSearchResponse = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(duplicateSeed.data.drawing_number)}`, {
  headers: { cookie: managerCookie }
});
const managerSearchBody = await managerSearchResponse.json().catch(() => ({}));
results.push(await expectStatus("SEARCH-001 Manager search returns 200", managerSearchResponse.status, 200));
results.push(
  await expectStatus(
    "SEARCH-002 Manager search finds drawing number",
    managerSearchBody.submissions?.some((submission) => submission.id === duplicateSeed.body.submissionId) ?? false,
    true
  )
);

const unauthCheckoutResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ reason: "QC edit reservation" })
});
results.push(await expectStatus("CHECKOUT-001 unauthenticated checkout returns 401", unauthCheckoutResponse.status, 401));

const managerCheckoutResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ reason: "QC edit reservation" })
});
results.push(await expectStatus("CHECKOUT-002 manager checkout returns 403", managerCheckoutResponse.status, 403));

const engineerCheckoutResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ reason: "QC edit reservation" })
});
const engineerCheckoutBody = await engineerCheckoutResponse.json().catch(() => ({}));
results.push(await expectStatus("CHECKOUT-003 engineer checkout returns 200", engineerCheckoutResponse.status, 200));
results.push(await expectStatus("CHECKOUT-004 checkout returns lock owner", engineerCheckoutBody.lock?.locked_by, "user-engineer-demo"));

const sameEngineerCheckoutResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ reason: "QC edit reservation" })
});
const sameEngineerCheckoutBody = await sameEngineerCheckoutResponse.json().catch(() => ({}));
results.push(await expectStatus("CHECKOUT-005 same engineer checkout reuses lock", sameEngineerCheckoutBody.reused, true));

const unauthPreflightLockResponse = await fetch(`${baseUrl}/api/submissions/preflight-lock`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ part_number: duplicateSeed.data.part_number })
});
results.push(await expectStatus("CHECKOUT-010 unauthenticated lock preflight returns 401", unauthPreflightLockResponse.status, 401));

const ownerPreflightLockResponse = await fetch(`${baseUrl}/api/submissions/preflight-lock`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ part_number: duplicateSeed.data.part_number, drawing_number: duplicateSeed.data.drawing_number })
});
const ownerPreflightLockBody = await ownerPreflightLockResponse.json().catch(() => ({}));
results.push(await expectStatus("CHECKOUT-011 owner lock preflight returns 200", ownerPreflightLockResponse.status, 200));
results.push(await expectStatus("CHECKOUT-012 owner lock preflight allows own lock", ownerPreflightLockBody.lockedByCurrentUser, true));

const managerLockNotifications = await getNotifications(managerCookie);
results.push(
  await expectStatus(
    "NOTIFY-006 manager notifications include active checkout lock",
    managerLockNotifications.body.notifications?.some(
      (notification) => notification.kind === "active_lock" && notification.submission_id === duplicateSeed.body.submissionId
    ) ?? false,
    true
  )
);

const checkoutConflictSubmission = await postSubmission(
  {
    drawing_number: `QC-LOCK-${Date.now().toString().slice(-6)}`,
    part_number: duplicateSeed.data.part_number,
    revision: "B"
  },
  true,
  engineer2Cookie
);
results.push(await expectStatus("CHECKOUT setup same part submission returns 201", checkoutConflictSubmission.status, 201));

const conflictCheckoutResponse = await fetch(`${baseUrl}/api/submissions/${checkoutConflictSubmission.body.submissionId}/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineer2Cookie },
  body: JSON.stringify({ reason: "QC competing edit reservation" })
});
const conflictCheckoutBody = await conflictCheckoutResponse.json().catch(() => ({}));
results.push(await expectStatus("CHECKOUT-006 competing checkout returns 409", conflictCheckoutResponse.status, 409));
results.push(await expectStatus("CHECKOUT-007 competing checkout exposes owner", conflictCheckoutBody.lock?.locked_by, "user-engineer-demo"));

const otherPreflightLockResponse = await fetch(`${baseUrl}/api/submissions/preflight-lock`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineer2Cookie },
  body: JSON.stringify({ part_number: duplicateSeed.data.part_number })
});
const otherPreflightLockBody = await otherPreflightLockResponse.json().catch(() => ({}));
results.push(await expectStatus("CHECKOUT-013 other engineer lock preflight returns 200", otherPreflightLockResponse.status, 200));
results.push(await expectStatus("CHECKOUT-014 other engineer lock preflight exposes active lock", otherPreflightLockBody.locked, true));
results.push(await expectStatus("CHECKOUT-015 other engineer lock preflight marks lock as not owned", otherPreflightLockBody.lockedByCurrentUser, false));
results.push(await expectStatus("CHECKOUT-016 other engineer lock preflight exposes owner", otherPreflightLockBody.lock?.locked_by, "user-engineer-demo"));

const engineerCheckoutReleaseResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/checkout`, {
  method: "DELETE",
  headers: { cookie: engineerCookie }
});
const engineerCheckoutReleaseBody = await engineerCheckoutReleaseResponse.json().catch(() => ({}));
results.push(await expectStatus("CHECKOUT-008 engineer checkout release returns 200", engineerCheckoutReleaseResponse.status, 200));
results.push(await expectStatus("CHECKOUT-009 engineer checkout release confirms release", engineerCheckoutReleaseBody.released, true));

const unauthSandboxResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/sandbox`);
results.push(await expectStatus("SANDBOX-001 unauthenticated sandbox list returns 401", unauthSandboxResponse.status, 401));

const managerSandboxCreateResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/sandbox`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ branchName: "QC manager sandbox", reason: "QC manager should not create sandbox" })
});
results.push(await expectStatus("SANDBOX-002 manager cannot create sandbox branch", managerSandboxCreateResponse.status, 403));

const sandboxCreateResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/sandbox`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ branchName: `QC sandbox ${Date.now().toString().slice(-6)}`, reason: "QC prototype branch" })
});
const sandboxCreateBody = await sandboxCreateResponse.json().catch(() => ({}));
results.push(await expectStatus("SANDBOX-003 engineer creates sandbox branch", sandboxCreateResponse.status, 201));
results.push(await expectStatus("SANDBOX-004 sandbox branch is active", sandboxCreateBody.branch?.status, "active"));
results.push(
  await expectStatus(
    "SANDBOX-005 sandbox revision is isolated from source revision",
    sandboxCreateBody.branch?.sandbox_revision !== duplicateSeed.data.revision,
    true
  )
);

const sandboxListResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/sandbox`, {
  headers: { cookie: engineerCookie }
});
const sandboxListBody = await sandboxListResponse.json().catch(() => ({}));
results.push(await expectStatus("SANDBOX-006 engineer lists source sandbox branches", sandboxListResponse.status, 200));
results.push(
  await expectStatus(
    "SANDBOX-007 source sandbox list includes created branch",
    sandboxListBody.branches?.some((branch) => branch.id === sandboxCreateBody.branch?.id) ?? false,
    true
  )
);

const sandboxMergePreviewResponse = await fetch(
  `${baseUrl}/api/submissions/${sandboxCreateBody.submissionId}/sandbox/${sandboxCreateBody.branch?.id}`,
  { headers: { cookie: engineerCookie } }
);
const sandboxMergePreviewBody = await sandboxMergePreviewResponse.json().catch(() => ({}));
results.push(await expectStatus("SANDBOX-015 engineer reads sandbox merge preview", sandboxMergePreviewResponse.status, 200));
results.push(await expectStatus("SANDBOX-016 merge preview is mergeable", sandboxMergePreviewBody.merge_preview?.can_merge, true));
results.push(
  await expectStatus(
    "SANDBOX-017 merge preview detects sandbox revision change",
    sandboxMergePreviewBody.merge_preview?.field_changes?.some((change) => change.field === "revision") ?? false,
    true
  )
);

const sandboxDetailResponse = await fetch(`${baseUrl}/api/submissions/${sandboxCreateBody.submissionId}`, {
  headers: { cookie: engineerCookie }
});
const sandboxDetailBody = await sandboxDetailResponse.json().catch(() => ({}));
results.push(await expectStatus("SANDBOX-008 engineer can open sandbox submission detail", sandboxDetailResponse.status, 200));
results.push(await expectStatus("SANDBOX-009 sandbox detail copies source files", sandboxDetailBody.submission?.files?.length ?? 0, 1));

const sandboxActiveApproveResponse = await fetch(`${baseUrl}/api/submissions/${sandboxCreateBody.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC active sandbox approve attempt" })
});
results.push(await expectStatus("SANDBOX-010 active sandbox cannot be approved", sandboxActiveApproveResponse.status, 409));

const sandboxPromoteResponse = await fetch(
  `${baseUrl}/api/submissions/${sandboxCreateBody.submissionId}/sandbox/${sandboxCreateBody.branch?.id}`,
  {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: engineerCookie },
    body: JSON.stringify({ action: "merge" })
  }
);
const sandboxPromoteBody = await sandboxPromoteResponse.json().catch(() => ({}));
results.push(await expectStatus("SANDBOX-011 engineer merges own sandbox branch", sandboxPromoteResponse.status, 200));
results.push(await expectStatus("SANDBOX-012 merged sandbox branch status", sandboxPromoteBody.branch?.status, "promoted"));
results.push(await expectStatus("SANDBOX-018 merged sandbox branch records merged_at", Boolean(sandboxPromoteBody.branch?.merged_at), true));
results.push(await expectStatus("SANDBOX-019 merged sandbox branch returns summary", sandboxPromoteBody.merge_preview?.can_merge, true));

const sandboxPromotedApproveResponse = await fetch(`${baseUrl}/api/submissions/${sandboxCreateBody.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC approve promoted sandbox" })
});
const sandboxPromotedApproveBody = await sandboxPromotedApproveResponse.json().catch(() => ({}));
results.push(await expectStatus("SANDBOX-013 promoted sandbox can enter release flow", sandboxPromotedApproveResponse.status, 200));
results.push(await expectStatus("SANDBOX-014 promoted sandbox reaches Released", sandboxPromotedApproveBody.status, "Released"));

const duplicateSeedDetailResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}`, {
  headers: { cookie: engineerCookie }
});
const duplicateSeedDetail = await duplicateSeedDetailResponse.json();
const pdfFile = duplicateSeedDetail.submission?.files?.find((file) => file.file_role === "pdf");

const unauthDownloadResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/files/${pdfFile?.id ?? "missing"}`);
results.push(await expectStatus("AUTH-003 unauthenticated file download returns 401", unauthDownloadResponse.status, 401));

const downloadResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/files/${pdfFile?.id ?? "missing"}`, {
  headers: { cookie: engineerCookie, ...qcStorageAuditHeaders }
});
results.push(await expectStatus("FILE-001 submission file download returns 200", downloadResponse.status, 200));
results.push(await expectStatus("FILE-002 download uses attachment disposition", downloadResponse.headers.get("content-disposition")?.startsWith("attachment") ?? false, true));

const previewResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/files/preview/${pdfFile?.id ?? "missing"}`, {
  headers: { cookie: engineerCookie, ...qcStorageAuditHeaders }
});
results.push(await expectStatus("FILE-003 PDF preview returns 200", previewResponse.status, 200));
results.push(await expectStatus("FILE-004 PDF preview content type is application/pdf", previewResponse.headers.get("content-type"), "application/pdf"));
results.push(await expectStatus("FILE-005 PDF preview uses inline disposition", previewResponse.headers.get("content-disposition")?.startsWith("inline") ?? false, true));

const fileStorageAudits = getStorageAccessAudits(duplicateSeed.body.submissionId);
const downloadAudit = fileStorageAudits.find((audit) => audit.detail.accessKind === "submission_file" && audit.detail.fileId === pdfFile?.id);
const previewAudit = fileStorageAudits.find((audit) => audit.detail.accessKind === "submission_file_preview" && audit.detail.fileId === pdfFile?.id);
const fileAuditText = JSON.stringify(fileStorageAudits);
results.push(await expectStatus("FILE-006 file download writes StorageAccessed audit", Boolean(downloadAudit), true));
results.push(await expectStatus("FILE-007 file preview writes StorageAccessed audit", Boolean(previewAudit), true));
results.push(await expectStatus("FILE-008 file audit records download route", downloadAudit?.detail.route, "/api/submissions/[id]/files/[...filePath]"));
results.push(await expectStatus("FILE-009 preview audit records inline disposition", previewAudit?.detail.disposition, "inline"));
results.push(await expectStatus("FILE-010 file audits record positive byte counts", Number(downloadAudit?.detail.bytes ?? 0) > 0 && Number(previewAudit?.detail.bytes ?? 0) > 0, true));
results.push(await expectStatus("FILE-011 file audits record QC runtime provenance", storageAuditHasExpectedProvenance(downloadAudit) && storageAuditHasExpectedProvenance(previewAudit), true));
results.push(
  await expectStatus(
    "FILE-012 file audits redact signed URL values",
    !fileAuditText.includes('"url"') && !fileAuditText.includes("storage.example"),
    true
  )
);

const unauthDiscussionList = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/discussions`);
results.push(await expectStatus("DISCUSS-001 unauthenticated discussion list returns 401", unauthDiscussionList.status, 401));

const unauthDiscussionCreate = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/discussions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ body: "Unauthenticated comment" })
});
results.push(await expectStatus("DISCUSS-002 unauthenticated discussion create returns 401", unauthDiscussionCreate.status, 401));

const submissionCommentResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/discussions`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ body: "QC submission discussion comment" })
});
const submissionCommentBody = await submissionCommentResponse.json().catch(() => ({}));
results.push(await expectStatus("DISCUSS-003 Engineer creates submission comment", submissionCommentResponse.status, 201));
results.push(await expectStatus("DISCUSS-004 submission comment is open", submissionCommentBody.comment?.status, "open"));

const fileCommentResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/discussions`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ body: "QC file-specific discussion comment", fileId: pdfFile?.id })
});
const fileCommentBody = await fileCommentResponse.json().catch(() => ({}));
results.push(await expectStatus("DISCUSS-005 Engineer creates file comment", fileCommentResponse.status, 201));
results.push(await expectStatus("DISCUSS-006 file comment exposes file name", fileCommentBody.comment?.file_original_filename, pdfFile?.original_filename));

const discussionListResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/discussions`, {
  headers: { cookie: engineerCookie }
});
const discussionListBody = await discussionListResponse.json().catch(() => ({}));
results.push(await expectStatus("DISCUSS-007 Engineer lists own discussion comments", discussionListResponse.status, 200));
results.push(await expectStatus("DISCUSS-008 discussion list has two comments", discussionListBody.comments?.length, 2));

const resolveDiscussionResponse = await fetch(
  `${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/discussions/${submissionCommentBody.comment?.id ?? "missing"}`,
  {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ resolved: true })
  }
);
const resolveDiscussionBody = await resolveDiscussionResponse.json().catch(() => ({}));
results.push(await expectStatus("DISCUSS-009 Manager resolves discussion comment", resolveDiscussionResponse.status, 200));
results.push(await expectStatus("DISCUSS-010 resolved discussion status", resolveDiscussionBody.comment?.status, "resolved"));

const managerDiscussionListResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/discussions`, {
  headers: { cookie: managerCookie }
});
const managerDiscussionListBody = await managerDiscussionListResponse.json().catch(() => ({}));
results.push(await expectStatus("DISCUSS-011 Manager lists team discussion comments", managerDiscussionListResponse.status, 200));
results.push(await expectStatus("DISCUSS-012 Manager sees resolved metadata", Boolean(managerDiscussionListBody.comments?.[0]?.resolved_by_name), true));

const otherEngineerSubmission = await postSubmission(
  {
    drawing_number: `QC-OTHER-${Date.now().toString().slice(-6)}`,
    part_number: `P-QC-OTHER-${Date.now().toString().slice(-6)}`
  },
  true,
  engineer2Cookie
);
results.push(await expectStatus("AUTH setup second Engineer submission returns 201", otherEngineerSubmission.status, 201));

const scopedListResponse = await fetch(`${baseUrl}/api/submissions?status=Pending`, {
  headers: { cookie: engineerCookie }
});
const scopedListBody = await scopedListResponse.json();
const scopedListHasOtherSubmission = scopedListBody.submissions?.some((submission) => submission.id === otherEngineerSubmission.body.submissionId) ?? false;
results.push(await expectStatus("AUTH-004 Engineer list excludes other Engineer submissions", scopedListHasOtherSubmission, false));

const scopedNotificationBody = (await getNotifications(engineerCookie)).body;
const scopedNotificationsHasOtherSubmission =
  scopedNotificationBody.notifications?.some((notification) => notification.submission_id === otherEngineerSubmission.body.submissionId) ?? false;
results.push(await expectStatus("NOTIFY-007 Engineer notifications exclude other Engineer submissions", scopedNotificationsHasOtherSubmission, false));

const scopedSearchResponse = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(otherEngineerSubmission.data.drawing_number)}`, {
  headers: { cookie: engineerCookie }
});
const scopedSearchBody = await scopedSearchResponse.json().catch(() => ({}));
const scopedSearchHasOtherSubmission = scopedSearchBody.submissions?.some(
  (submission) => submission.id === otherEngineerSubmission.body.submissionId
) ?? false;
results.push(await expectStatus("SEARCH-003 Engineer search excludes other Engineer submissions", scopedSearchHasOtherSubmission, false));

const otherDetailAsEngineer = await fetch(`${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("AUTH-005 Engineer detail for other Engineer submission returns 403", otherDetailAsEngineer.status, 403));

const otherDetailAsManager = await fetch(`${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}`, {
  headers: { cookie: managerCookie }
});
results.push(await expectStatus("AUTH-006 Manager detail for Engineer submission returns 200", otherDetailAsManager.status, 200));
const otherDetailBody = await otherDetailAsManager.json();
const otherPdfFile = otherDetailBody.submission?.files?.find((file) => file.file_role === "pdf");

const crossFileDiscussionResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/discussions`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ body: "QC invalid cross-submission file comment", fileId: otherPdfFile?.id })
});
results.push(await expectStatus("DISCUSS-013 cross-submission file comment returns 400", crossFileDiscussionResponse.status, 400));

const otherDiscussionAsEngineer = await fetch(`${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}/discussions`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("DISCUSS-014 Engineer cannot list other Engineer discussions", otherDiscussionAsEngineer.status, 403));

const unauthIssueList = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/issues`);
results.push(await expectStatus("ISSUE-001 unauthenticated issue list returns 401", unauthIssueList.status, 401));

const unauthIssueCreate = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/issues`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "Unauthenticated issue", description: "Should not be accepted" })
});
results.push(await expectStatus("ISSUE-002 unauthenticated issue create returns 401", unauthIssueCreate.status, 401));

const emptyIssueTitle = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/issues`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ title: "", description: "Missing actionable issue title" })
});
results.push(await expectStatus("ISSUE-003 empty issue title returns 400", emptyIssueTitle.status, 400));

const createIssueResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/issues`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({
    title: "Clarify tolerance stack",
    description: "Drawing tolerance stack needs reviewer confirmation before release.",
    fileId: pdfFile?.id
  })
});
const createIssueBody = await createIssueResponse.json().catch(() => ({}));
results.push(await expectStatus("ISSUE-004 Engineer creates file review issue", createIssueResponse.status, 201));
results.push(await expectStatus("ISSUE-005 created issue is open", createIssueBody.issue?.status, "open"));
results.push(await expectStatus("ISSUE-006 issue exposes file name", createIssueBody.issue?.file_original_filename, pdfFile?.original_filename));
results.push(await expectStatus("ISSUE-007 issue defaults owner to submitter", createIssueBody.issue?.assignee_id, "user-engineer-demo"));

const issueListResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/issues`, {
  headers: { cookie: engineerCookie }
});
const issueListBody = await issueListResponse.json().catch(() => ({}));
results.push(await expectStatus("ISSUE-008 Engineer lists own review issues", issueListResponse.status, 200));
results.push(await expectStatus("ISSUE-009 issue list has created issue", issueListBody.issues?.some((issue) => issue.id === createIssueBody.issue?.id), true));

const resolveIssueResponse = await fetch(
  `${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/issues/${createIssueBody.issue?.id ?? "missing"}`,
  {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ resolved: true, resolution: "Tolerance stack confirmed by reviewer" })
  }
);
const resolveIssueBody = await resolveIssueResponse.json().catch(() => ({}));
results.push(await expectStatus("ISSUE-010 Manager resolves review issue", resolveIssueResponse.status, 200));
results.push(await expectStatus("ISSUE-011 resolved issue keeps metadata", Boolean(resolveIssueBody.issue?.resolved_by_name && resolveIssueBody.issue?.resolution), true));

const crossFileIssueResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/issues`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({
    title: "Invalid file issue",
    description: "Should reject a file from another submission.",
    fileId: otherPdfFile?.id
  })
});
results.push(await expectStatus("ISSUE-012 cross-submission file issue returns 400", crossFileIssueResponse.status, 400));

const otherIssueAsEngineer = await fetch(`${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}/issues`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("ISSUE-013 Engineer cannot list other Engineer issues", otherIssueAsEngineer.status, 403));

const unauthChangeList = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes`);
results.push(await expectStatus("CHANGE-001 unauthenticated change list returns 401", unauthChangeList.status, 401));

const emptyChangeTitle = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ kind: "ECR", title: "", reason: "Missing title", impact: "No impact" })
});
results.push(await expectStatus("CHANGE-002 empty change title returns 400", emptyChangeTitle.status, 400));

const createEcrResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({
    kind: "ECR",
    title: "Clarify tolerance change",
    reason: "Reviewer requested tolerance rationale before release.",
    impact: "May require drawing note update and supplier notification."
  })
});
const createEcrBody = await createEcrResponse.json().catch(() => ({}));
results.push(await expectStatus("CHANGE-003 Engineer creates ECR", createEcrResponse.status, 201));
results.push(await expectStatus("CHANGE-004 created ECR is open", createEcrBody.change?.status, "open"));
results.push(await expectStatus("CHANGE-005 created ECR keeps kind", createEcrBody.change?.kind, "ECR"));

const createEcoResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({
    kind: "ECO",
    title: "Update released package checklist",
    reason: "Manager wants a formal implementation note.",
    impact: "Manufacturing handoff checklist changes."
  })
});
const createEcoBody = await createEcoResponse.json().catch(() => ({}));
results.push(await expectStatus("CHANGE-006 Manager creates ECO", createEcoResponse.status, 201));
results.push(await expectStatus("CHANGE-007 created ECO keeps kind", createEcoBody.change?.kind, "ECO"));

const createEcnResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({
    kind: "ECN",
    title: "Notify supplier trial note",
    reason: "Supplier should know the pending drawing note changed.",
    impact: "External package consumers need a visible notice."
  })
});
const createEcnBody = await createEcnResponse.json().catch(() => ({}));
results.push(await expectStatus("CHANGE-008 Engineer creates ECN", createEcnResponse.status, 201));
results.push(await expectStatus("CHANGE-009 created ECN keeps kind", createEcnBody.change?.kind, "ECN"));

const changeListResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes`, {
  headers: { cookie: engineerCookie }
});
const changeListBody = await changeListResponse.json().catch(() => ({}));
results.push(await expectStatus("CHANGE-010 Engineer lists own changes", changeListResponse.status, 200));
results.push(
  await expectStatus(
    "CHANGE-011 list includes ECR ECO and ECN",
    ["ECR", "ECO", "ECN"].every((kind) => changeListBody.changes?.some((change) => change.kind === kind)),
    true
  )
);

const engineerApproveChangeResponse = await fetch(
  `${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes/${createEcrBody.change?.id ?? "missing"}`,
  {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: engineerCookie },
    body: JSON.stringify({ action: "approve", comment: "Engineer should not approve change" })
  }
);
results.push(await expectStatus("CHANGE-012 Engineer cannot approve change request", engineerApproveChangeResponse.status, 403));

const managerApproveChangeResponse = await fetch(
  `${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes/${createEcrBody.change?.id ?? "missing"}`,
  {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ action: "approve", comment: "Change accepted for implementation" })
  }
);
const managerApproveChangeBody = await managerApproveChangeResponse.json().catch(() => ({}));
results.push(await expectStatus("CHANGE-013 Manager approves ECR", managerApproveChangeResponse.status, 200));
results.push(await expectStatus("CHANGE-014 approved ECR status", managerApproveChangeBody.change?.status, "approved"));
results.push(await expectStatus("CHANGE-015 approved ECR has decision metadata", Boolean(managerApproveChangeBody.change?.decided_by_name), true));

const duplicateApproveChangeResponse = await fetch(
  `${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/changes/${createEcrBody.change?.id ?? "missing"}`,
  {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ action: "reject", comment: "Duplicate decision should fail" })
  }
);
results.push(await expectStatus("CHANGE-016 decided change cannot be decided again", duplicateApproveChangeResponse.status, 409));

const otherChangeAsEngineer = await fetch(`${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}/changes`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("CHANGE-017 Engineer cannot list other Engineer changes", otherChangeAsEngineer.status, 403));

const phaseSeed = await postSubmission({
  drawing_number: `QC-PHASE-${Date.now().toString().slice(-6)}`,
  part_number: `P-QC-PHASE-${Date.now().toString().slice(-6)}`
});
results.push(await expectStatus("PHASE setup pending submission returns 201", phaseSeed.status, 201));

const unauthPhaseList = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/phase-gates`);
results.push(await expectStatus("PHASE-001 unauthenticated phase gate list returns 401", unauthPhaseList.status, 401));

const engineerPhaseInit = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/phase-gates`, {
  method: "POST",
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("PHASE-002 Engineer cannot initialize phase gates", engineerPhaseInit.status, 403));

const managerPhaseInit = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/phase-gates`, {
  method: "POST",
  headers: { cookie: managerCookie }
});
const managerPhaseInitBody = await managerPhaseInit.json().catch(() => ({}));
results.push(await expectStatus("PHASE-003 Manager initializes phase gates", managerPhaseInit.status, 201));
results.push(await expectStatus("PHASE-004 default phase gate count", managerPhaseInitBody.checks?.length, 4));
results.push(await expectStatus("PHASE-005 phase gates start with four open required checks", managerPhaseInitBody.summary?.open_required, 4));

const phaseBlockedApprove = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC blocked by phase gates" })
});
results.push(await expectStatus("PHASE-006 open required phase gates block approval", phaseBlockedApprove.status, 409));

const firstPhaseCheckId = managerPhaseInitBody.checks?.[0]?.id ?? "missing";
const engineerPhaseDecision = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/phase-gates/${firstPhaseCheckId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ action: "complete", comment: "Engineer should not decide gate" })
});
results.push(await expectStatus("PHASE-007 Engineer cannot decide phase gate", engineerPhaseDecision.status, 403));

for (const check of managerPhaseInitBody.checks ?? []) {
  const action = check.gate_code === "release" ? "waive" : "complete";
  const phaseDecisionResponse = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/phase-gates/${check.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ action, comment: `QC ${action} ${check.gate_code}` })
  });
  results.push(await expectStatus(`PHASE decision ${check.gate_code} returns 200`, phaseDecisionResponse.status, 200));
}

const phaseListAfterDecision = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/phase-gates`, {
  headers: { cookie: managerCookie }
});
const phaseListAfterDecisionBody = await phaseListAfterDecision.json().catch(() => ({}));
results.push(await expectStatus("PHASE-008 phase gate list after decisions returns 200", phaseListAfterDecision.status, 200));
results.push(await expectStatus("PHASE-009 no required phase gates remain open", phaseListAfterDecisionBody.summary?.open_required, 0));
results.push(await expectStatus("PHASE-010 phase gate summary is ready", phaseListAfterDecisionBody.summary?.ready_for_release, true));

const duplicatePhaseDecision = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/phase-gates/${firstPhaseCheckId}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ action: "waive", comment: "Duplicate gate decision should fail" })
});
results.push(await expectStatus("PHASE-011 decided phase gate cannot be decided again", duplicatePhaseDecision.status, 409));

const phaseReleasedApprove = await fetch(`${baseUrl}/api/submissions/${phaseSeed.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC approved after phase gates" })
});
const phaseReleasedApproveBody = await phaseReleasedApprove.json().catch(() => ({}));
results.push(await expectStatus("PHASE-012 completed phase gates allow approval", phaseReleasedApprove.status, 200));
results.push(await expectStatus("PHASE-013 completed phase gates release submission", phaseReleasedApproveBody.status, "Released"));

const matrixSeed = await postSubmission({
  drawing_number: `QC-MATRIX-${Date.now().toString().slice(-6)}`,
  part_number: `P-QC-MATRIX-${Date.now().toString().slice(-6)}`
});

const unauthMatrixList = await fetch(`${baseUrl}/api/submissions/${matrixSeed.body.submissionId}/approval-matrix`);
results.push(await expectStatus("MATRIX-001 unauthenticated approval matrix list returns 401", unauthMatrixList.status, 401));

const engineerMatrixInit = await fetch(`${baseUrl}/api/submissions/${matrixSeed.body.submissionId}/approval-matrix`, {
  method: "POST",
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("MATRIX-002 Engineer cannot initialize approval matrix", engineerMatrixInit.status, 403));

const managerMatrixInit = await fetch(`${baseUrl}/api/submissions/${matrixSeed.body.submissionId}/approval-matrix`, {
  method: "POST",
  headers: { cookie: managerCookie }
});
const managerMatrixInitBody = await managerMatrixInit.json().catch(() => ({}));
results.push(await expectStatus("MATRIX-003 Manager initializes approval matrix", managerMatrixInit.status, 201));
results.push(await expectStatus("MATRIX-004 default matrix count", managerMatrixInitBody.requirements?.length, 2));
results.push(await expectStatus("MATRIX-005 matrix starts with two open roles", managerMatrixInitBody.summary?.open_required, 2));

const matrixManagerApprove = await fetch(`${baseUrl}/api/submissions/${matrixSeed.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC matrix manager approval" })
});
const matrixManagerApproveBody = await matrixManagerApprove.json().catch(() => ({}));
results.push(await expectStatus("MATRIX-006 manager approval returns 200", matrixManagerApprove.status, 200));
results.push(await expectStatus("MATRIX-007 manager approval keeps Pending for Admin role", matrixManagerApproveBody.status, "Pending"));
results.push(await expectStatus("MATRIX-008 manager approval reports one open matrix role", matrixManagerApproveBody.matrix?.open_requirements?.length, 1));

const matrixAfterManager = await fetch(`${baseUrl}/api/submissions/${matrixSeed.body.submissionId}/approval-matrix`, {
  headers: { cookie: managerCookie }
});
const matrixAfterManagerBody = await matrixAfterManager.json().catch(() => ({}));
results.push(await expectStatus("MATRIX-009 manager role is satisfied after manager approval", matrixAfterManagerBody.requirements?.find((item) => item.required_role === "R&D Manager")?.status, "satisfied"));

const matrixAdminApprove = await fetch(`${baseUrl}/api/submissions/${matrixSeed.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: adminCookie },
  body: JSON.stringify({ comment: "QC matrix admin approval" })
});
const matrixAdminApproveBody = await matrixAdminApprove.json().catch(() => ({}));
results.push(await expectStatus("MATRIX-010 admin approval returns 200", matrixAdminApprove.status, 200));
results.push(await expectStatus("MATRIX-011 matrix releases after required roles approve", matrixAdminApproveBody.status, "Released"));

const matrixWaiveSeed = await postSubmission({
  drawing_number: `QC-MATRIX-W-${Date.now().toString().slice(-6)}`,
  part_number: `P-QC-MATRIX-W-${Date.now().toString().slice(-6)}`
});
const matrixWaiveInit = await fetch(`${baseUrl}/api/submissions/${matrixWaiveSeed.body.submissionId}/approval-matrix`, {
  method: "POST",
  headers: { cookie: managerCookie }
});
const matrixWaiveInitBody = await matrixWaiveInit.json().catch(() => ({}));
const adminRequirement = matrixWaiveInitBody.requirements?.find((item) => item.required_role === "Admin");
const matrixWaiveAdmin = await fetch(`${baseUrl}/api/submissions/${matrixWaiveSeed.body.submissionId}/approval-matrix/${adminRequirement?.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ action: "waive", comment: "Admin role waived for QC" })
});
const matrixWaiveAdminBody = await matrixWaiveAdmin.json().catch(() => ({}));
results.push(await expectStatus("MATRIX-012 manager can waive open Admin requirement", matrixWaiveAdmin.status, 200));
results.push(await expectStatus("MATRIX-013 waived Admin requirement status", matrixWaiveAdminBody.requirement?.status, "waived"));

const matrixWaiveApprove = await fetch(`${baseUrl}/api/submissions/${matrixWaiveSeed.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC release with waived admin matrix" })
});
const matrixWaiveApproveBody = await matrixWaiveApprove.json().catch(() => ({}));
results.push(await expectStatus("MATRIX-014 waived matrix allows manager-only release", matrixWaiveApprove.status, 200));
results.push(await expectStatus("MATRIX-015 waived matrix reaches Released", matrixWaiveApproveBody.status, "Released"));

const unauthMarkupList = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/pdf-markups`);
results.push(await expectStatus("MARKUP-001 unauthenticated PDF markup list returns 401", unauthMarkupList.status, 401));

const unauthMarkupCreate = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/pdf-markups`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ fileId: pdfFile?.id, pageNumber: 1, xPercent: 50, yPercent: 50, body: "Unauthenticated markup" })
});
results.push(await expectStatus("MARKUP-002 unauthenticated PDF markup create returns 401", unauthMarkupCreate.status, 401));

const markupNonPdfToken = `${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}`;
const nonPdfMarkupSubmission = await postSubmissionWithFile(
  new File([Buffer.from("qc non pdf native placeholder")], `QC-MARKUP-NONPDF-${markupNonPdfToken}.sldprt`, {
    type: "application/octet-stream"
  }),
  { drawing_number: `QC-MARKUP-NONPDF-${markupNonPdfToken}`, document_type: "Part" }
);
const nonPdfMarkupDetailResponse = await fetch(`${baseUrl}/api/submissions/${nonPdfMarkupSubmission.body.submissionId}`, {
  headers: { cookie: engineerCookie }
});
const nonPdfMarkupDetailBody = await nonPdfMarkupDetailResponse.json().catch(() => ({}));
const nonPdfFile = nonPdfMarkupDetailBody.submission?.files?.find((file) => file.file_role === "sldprt");
const nonPdfMarkupCreate = await fetch(`${baseUrl}/api/submissions/${nonPdfMarkupSubmission.body.submissionId}/pdf-markups`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ fileId: nonPdfFile?.id, pageNumber: 1, xPercent: 50, yPercent: 50, body: "Should reject non-PDF" })
});
results.push(await expectStatus("MARKUP-003 non-PDF markup create returns 400", nonPdfMarkupCreate.status, 400));

const invalidCoordinateMarkup = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/pdf-markups`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ fileId: pdfFile?.id, pageNumber: 1, xPercent: 120, yPercent: 50, body: "Invalid coordinate" })
});
results.push(await expectStatus("MARKUP-004 invalid PDF markup coordinate returns 400", invalidCoordinateMarkup.status, 400));

const createMarkupResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/pdf-markups`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({
    fileId: pdfFile?.id,
    pageNumber: 2,
    xPercent: 35.25,
    yPercent: 48.75,
    body: "Move dimension callout away from title block."
  })
});
const createMarkupBody = await createMarkupResponse.json().catch(() => ({}));
results.push(await expectStatus("MARKUP-005 Engineer creates PDF markup", createMarkupResponse.status, 201));
results.push(
  await expectStatus(
    "MARKUP-006 created PDF markup keeps page coordinate metadata",
    createMarkupBody.markup?.status === "open" &&
      createMarkupBody.markup?.page_number === 2 &&
      createMarkupBody.markup?.x_percent === 35.25 &&
      createMarkupBody.markup?.file_original_filename === pdfFile?.original_filename,
    true
  )
);

const markupListResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/pdf-markups`, {
  headers: { cookie: engineerCookie }
});
const markupListBody = await markupListResponse.json().catch(() => ({}));
results.push(await expectStatus("MARKUP-007 Engineer lists own PDF markups", markupListResponse.status, 200));
results.push(await expectStatus("MARKUP-008 PDF markup list includes created markup", markupListBody.markups?.some((markup) => markup.id === createMarkupBody.markup?.id), true));

const resolveMarkupResponse = await fetch(
  `${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/pdf-markups/${createMarkupBody.markup?.id ?? "missing"}`,
  {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: managerCookie },
    body: JSON.stringify({ resolved: true })
  }
);
const resolveMarkupBody = await resolveMarkupResponse.json().catch(() => ({}));
results.push(await expectStatus("MARKUP-009 Manager resolves PDF markup", resolveMarkupResponse.status, 200));
results.push(await expectStatus("MARKUP-010 resolved PDF markup keeps resolver metadata", Boolean(resolveMarkupBody.markup?.resolved_by_name && resolveMarkupBody.markup?.resolved_at), true));

const crossFileMarkupResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/pdf-markups`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ fileId: otherPdfFile?.id, pageNumber: 1, xPercent: 50, yPercent: 50, body: "Should reject cross-submission file" })
});
results.push(await expectStatus("MARKUP-011 cross-submission PDF markup file returns 400", crossFileMarkupResponse.status, 400));

const otherMarkupAsEngineer = await fetch(`${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}/pdf-markups`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("MARKUP-012 Engineer cannot list other Engineer PDF markups", otherMarkupAsEngineer.status, 403));

const otherFileAsEngineer = await fetch(
  `${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}/files/${otherPdfFile?.id ?? "missing"}`,
  { headers: { cookie: engineerCookie } }
);
results.push(await expectStatus("AUTH-007 Engineer download for other Engineer file returns 403", otherFileAsEngineer.status, 403));

const reuseToken = `${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}`;
const reuseSource = await postSubmissionWithFile(
  new File([Buffer.from("reuse source bracket pdf")], `REUSE-${reuseToken}-bracket-source.pdf`, { type: "application/pdf" }),
  {
    drawing_number: `QC-REUSE-SRC-${reuseToken}`,
    part_number: `P-REUSE-${reuseToken}-001`,
    part_name: "Reusable Bracket Plate",
    material: "A6061",
    surface_finish: "Anodized Clear",
    document_type: "Drawing"
  }
);
results.push(await expectStatus("REUSE setup source submission returns 201", reuseSource.status, 201));

const reuseTarget = await postSubmissionWithFile(
  new File([Buffer.from("reuse target bracket pdf")], `REUSE-${reuseToken}-bracket-target.pdf`, { type: "application/pdf" }),
  {
    drawing_number: `QC-REUSE-TGT-${reuseToken}`,
    part_number: `P-REUSE-${reuseToken}-002`,
    part_name: "Reusable Bracket Variant",
    material: "A6061",
    surface_finish: "Anodized Clear",
    document_type: "Drawing"
  }
);
results.push(await expectStatus("REUSE setup target submission returns 201", reuseTarget.status, 201));

const reuseOtherEngineer = await postSubmissionWithFile(
  new File([Buffer.from("reuse other engineer bracket pdf")], `REUSE-${reuseToken}-other-engineer.pdf`, { type: "application/pdf" }),
  {
    drawing_number: `QC-REUSE-OTHER-${reuseToken}`,
    part_number: `P-REUSE-${reuseToken}-003`,
    part_name: "Reusable Bracket Private",
    material: "A6061",
    surface_finish: "Anodized Clear",
    document_type: "Drawing"
  },
  engineer2Cookie
);
results.push(await expectStatus("REUSE setup other Engineer candidate returns 201", reuseOtherEngineer.status, 201));

const unauthReuseResponse = await fetch(`${baseUrl}/api/submissions/${reuseTarget.body.submissionId}/reuse-candidates`);
results.push(await expectStatus("REUSE-001 unauthenticated reuse candidates return 401", unauthReuseResponse.status, 401));

const engineerReuseResponse = await fetch(`${baseUrl}/api/submissions/${reuseTarget.body.submissionId}/reuse-candidates`, {
  headers: { cookie: engineerCookie }
});
const engineerReuseBody = await engineerReuseResponse.json().catch(() => ({}));
const engineerReuseIds = new Set(engineerReuseBody.candidates?.map((candidate) => candidate.id) ?? []);
const sourceCandidate = engineerReuseBody.candidates?.find((candidate) => candidate.id === reuseSource.body.submissionId);
results.push(await expectStatus("REUSE-002 Engineer can list own reuse candidates", engineerReuseResponse.status, 200));
results.push(await expectStatus("REUSE-003 reuse candidates include similar source", engineerReuseIds.has(reuseSource.body.submissionId), true));
results.push(await expectStatus("REUSE-004 reuse candidates exclude current submission", engineerReuseIds.has(reuseTarget.body.submissionId), false));
results.push(await expectStatus("REUSE-005 reuse candidate has score", (sourceCandidate?.score ?? 0) >= 50, true));
results.push(await expectStatus("REUSE-006 reuse candidate has match reasons", (sourceCandidate?.match_reasons?.length ?? 0) >= 3, true));
results.push(await expectStatus("REUSE-007 Engineer scoped reuse excludes other Engineer", engineerReuseIds.has(reuseOtherEngineer.body.submissionId), false));

const managerReuseResponse = await fetch(`${baseUrl}/api/submissions/${reuseTarget.body.submissionId}/reuse-candidates`, {
  headers: { cookie: managerCookie }
});
const managerReuseBody = await managerReuseResponse.json().catch(() => ({}));
const managerReuseIds = new Set(managerReuseBody.candidates?.map((candidate) => candidate.id) ?? []);
results.push(await expectStatus("REUSE-008 Manager can list reuse candidates", managerReuseResponse.status, 200));
results.push(await expectStatus("REUSE-009 Manager sees cross-owner reuse candidate", managerReuseIds.has(reuseOtherEngineer.body.submissionId), true));

const otherReuseAsEngineer = await fetch(`${baseUrl}/api/submissions/${reuseOtherEngineer.body.submissionId}/reuse-candidates`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("REUSE-010 Engineer cannot list other Engineer reuse candidates", otherReuseAsEngineer.status, 403));

const geoToken = `${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}`;
const exactGeometryBytes = Buffer.from("same native solidworks body fingerprint");
const geoSource = await postSubmissionWithFile(
  new File([exactGeometryBytes], `GEO-${geoToken}-plate-source.sldprt`, { type: "application/octet-stream" }),
  {
    drawing_number: `QC-GEO-SRC-${geoToken}`,
    part_number: `P-GEO-${geoToken}-001`,
    part_name: "Duplicate Geometry Source Plate",
    material: "SUS304",
    surface_finish: "No Finish",
    document_type: "Part"
  }
);
results.push(await expectStatus("GEODUP setup exact source submission returns 201", geoSource.status, 201));

const geoTarget = await postSubmissionWithFile(
  new File([exactGeometryBytes], `GEO-${geoToken}-plate-target.sldprt`, { type: "application/octet-stream" }),
  {
    drawing_number: `QC-GEO-TGT-${geoToken}`,
    part_number: `P-GEO-${geoToken}-002`,
    part_name: "Duplicate Geometry Target Plate",
    material: "SUS304",
    surface_finish: "No Finish",
    document_type: "Part"
  }
);
results.push(await expectStatus("GEODUP setup target submission returns 201", geoTarget.status, 201));

const geoLookalike = await postSubmissionWithFile(
  new File([Buffer.from("different native body similar filename size")], `GEO-${geoToken}-plate-target.sldprt`, { type: "application/octet-stream" }),
  {
    drawing_number: `QC-GEO-LOOK-${geoToken}`,
    part_number: `P-GEO-${geoToken}-003`,
    part_name: "Duplicate Geometry Lookalike Plate",
    material: "SUS304",
    surface_finish: "No Finish",
    document_type: "Part"
  }
);
results.push(await expectStatus("GEODUP setup metadata lookalike returns 201", geoLookalike.status, 201));

const geoOtherEngineer = await postSubmissionWithFile(
  new File([exactGeometryBytes], `GEO-${geoToken}-plate-private.sldprt`, { type: "application/octet-stream" }),
  {
    drawing_number: `QC-GEO-OTHER-${geoToken}`,
    part_number: `P-GEO-${geoToken}-004`,
    part_name: "Duplicate Geometry Private Plate",
    material: "SUS304",
    surface_finish: "No Finish",
    document_type: "Part"
  },
  engineer2Cookie
);
results.push(await expectStatus("GEODUP setup other Engineer duplicate returns 201", geoOtherEngineer.status, 201));

const unauthGeoDupResponse = await fetch(`${baseUrl}/api/submissions/${geoTarget.body.submissionId}/duplicate-geometry`);
results.push(await expectStatus("GEODUP-001 unauthenticated duplicate geometry search returns 401", unauthGeoDupResponse.status, 401));

const engineerGeoDupResponse = await fetch(`${baseUrl}/api/submissions/${geoTarget.body.submissionId}/duplicate-geometry`, {
  headers: { cookie: engineerCookie }
});
const engineerGeoDupBody = await engineerGeoDupResponse.json().catch(() => ({}));
const engineerGeoDupIds = new Set(engineerGeoDupBody.candidates?.map((candidate) => candidate.id) ?? []);
const exactGeoCandidate = engineerGeoDupBody.candidates?.find((candidate) => candidate.id === geoSource.body.submissionId);
const lookalikeGeoCandidate = engineerGeoDupBody.candidates?.find((candidate) => candidate.id === geoLookalike.body.submissionId);
results.push(await expectStatus("GEODUP-002 Engineer can list own duplicate geometry candidates", engineerGeoDupResponse.status, 200));
results.push(await expectStatus("GEODUP-003 exact native hash candidate is included", engineerGeoDupIds.has(geoSource.body.submissionId), true));
results.push(await expectStatus("GEODUP-004 exact native hash candidate has high confidence", exactGeoCandidate?.duplicate_level, "exact"));
results.push(
  await expectStatus(
    "GEODUP-005 candidate exposes fingerprint signals and matched files",
    Boolean(exactGeoCandidate?.fingerprint_signals?.some((signal) => signal.includes("hash")) && exactGeoCandidate?.matched_files?.length),
    true
  )
);
results.push(await expectStatus("GEODUP-006 Engineer scoped search excludes other Engineer candidate", engineerGeoDupIds.has(geoOtherEngineer.body.submissionId), false));

const managerGeoDupResponse = await fetch(`${baseUrl}/api/submissions/${geoTarget.body.submissionId}/duplicate-geometry`, {
  headers: { cookie: managerCookie }
});
const managerGeoDupBody = await managerGeoDupResponse.json().catch(() => ({}));
const managerGeoDupIds = new Set(managerGeoDupBody.candidates?.map((candidate) => candidate.id) ?? []);
results.push(await expectStatus("GEODUP-007 Manager can list duplicate geometry candidates", managerGeoDupResponse.status, 200));
results.push(await expectStatus("GEODUP-008 Manager sees cross-owner duplicate candidate", managerGeoDupIds.has(geoOtherEngineer.body.submissionId), true));

const otherGeoAsEngineer = await fetch(`${baseUrl}/api/submissions/${geoOtherEngineer.body.submissionId}/duplicate-geometry`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("GEODUP-009 Engineer cannot search another Engineer submission", otherGeoAsEngineer.status, 403));
results.push(
  await expectStatus(
    "GEODUP-010 metadata-only lookalike ranks below exact hash duplicate",
    (exactGeoCandidate?.fingerprint_score ?? 0) > (lookalikeGeoCandidate?.fingerprint_score ?? 0),
    true
  )
);

const historyToken = `${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}`;
const historyPartNumber = `P-QC-HIST-${historyToken}`;
const historyFirst = await postSubmission({
  drawing_number: `QC-HIST-A-${historyToken}`,
  part_number: historyPartNumber,
  revision: "A"
});
results.push(await expectStatus("HIST setup first revision returns 201", historyFirst.status, 201));

const historySecond = await postSubmission(
  {
    drawing_number: `QC-HIST-B-${historyToken}`,
    part_number: historyPartNumber,
    revision: "B"
  },
  true,
  engineer2Cookie
);
results.push(await expectStatus("HIST setup second revision returns 201", historySecond.status, 201));

const unauthHistoryResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(historyPartNumber)}/revisions`);
results.push(await expectStatus("HIST-001 unauthenticated revision history returns 401", unauthHistoryResponse.status, 401));

const managerHistoryResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(historyPartNumber)}/revisions`, {
  headers: { cookie: managerCookie }
});
const managerHistoryBody = await managerHistoryResponse.json().catch(() => ({}));
results.push(await expectStatus("HIST-002 Manager revision history returns 200", managerHistoryResponse.status, 200));
results.push(await expectStatus("HIST-003 Manager sees both revisions", managerHistoryBody.revisions?.length, 2));

const engineerHistoryResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(historyPartNumber)}/revisions`, {
  headers: { cookie: engineerCookie }
});
const engineerHistoryBody = await engineerHistoryResponse.json().catch(() => ({}));
results.push(await expectStatus("HIST-004 Engineer revision history returns 200", engineerHistoryResponse.status, 200));
results.push(await expectStatus("HIST-005 Engineer sees only own revision", engineerHistoryBody.revisions?.length, 1));
results.push(await expectStatus("HIST-006 Engineer scoped revision belongs to self", engineerHistoryBody.revisions?.[0]?.submitted_by, "user-engineer-demo"));

const bomToken = `${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}`;
const bomSubmission = await postSubmissionWithFile(
  new File([Buffer.from("qc sldasm placeholder")], `QC-BOM-${bomToken}.sldasm`, { type: "application/octet-stream" }),
  {
    drawing_number: `QC-BOM-${bomToken}`,
    part_number: `P-QC-BOM-${bomToken}`,
    document_type: "Assembly"
  }
);
results.push(await expectStatus("BOM setup assembly submission returns 201", bomSubmission.status, 201));

seedAssemblyReferences(bomSubmission.body.submissionId, [
  { filename: `QC-BOM-CHILD-1-${bomToken}.sldprt`, partNumber: `P-QC-BOM-C1-${bomToken}`, revision: "A", quantity: 2 },
  { filename: `QC-BOM-CHILD-2-${bomToken}.sldprt`, partNumber: `P-QC-BOM-C2-${bomToken}`, revision: "B", quantity: 4 }
]);

const unauthBomResponse = await fetch(`${baseUrl}/api/submissions/${bomSubmission.body.submissionId}/bom?materialize=1`);
results.push(await expectStatus("BOM-001 unauthenticated BOM returns 401", unauthBomResponse.status, 401));

const engineerBomResponse = await fetch(`${baseUrl}/api/submissions/${bomSubmission.body.submissionId}/bom?materialize=1`, {
  headers: { cookie: engineerCookie }
});
const engineerBomBody = await engineerBomResponse.json().catch(() => ({}));
results.push(await expectStatus("BOM-002 Engineer can materialize own BOM", engineerBomResponse.status, 200));
results.push(await expectStatus("BOM-003 BOM header is Draft", engineerBomBody.bom?.status, "Draft"));
results.push(await expectStatus("BOM-004 BOM contains two lines", engineerBomBody.bom?.lines?.length, 2));
results.push(await expectStatus("BOM-005 BOM preserves child quantity", engineerBomBody.bom?.lines?.[0]?.quantity, 2));
results.push(await expectStatus("BOM-006 BOM exposes parent part number", engineerBomBody.bom?.parent_part_number, bomSubmission.data.part_number));

const managerBomResponse = await fetch(`${baseUrl}/api/submissions/${bomSubmission.body.submissionId}/bom`, {
  headers: { cookie: managerCookie }
});
const managerBomBody = await managerBomResponse.json().catch(() => ({}));
results.push(await expectStatus("BOM-007 Manager can read materialized BOM", managerBomResponse.status, 200));
results.push(await expectStatus("BOM-008 BOM read returns existing lines", managerBomBody.bom?.lines?.length, 2));

const otherBomAsEngineer = await fetch(`${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}/bom`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("BOM-009 Engineer cannot read other Engineer BOM", otherBomAsEngineer.status, 403));

const unauthBomExportResponse = await fetch(`${baseUrl}/api/submissions/${bomSubmission.body.submissionId}/bom/export?format=csv`);
results.push(await expectStatus("BOMEXPORT-001 unauthenticated BOM CSV export returns 401", unauthBomExportResponse.status, 401));

const missingBomExportResponse = await fetch(`${baseUrl}/api/submissions/${duplicateSeed.body.submissionId}/bom/export?format=csv`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("BOMEXPORT-002 missing BOM export returns 404", missingBomExportResponse.status, 404));

const engineerBomExportResponse = await fetch(`${baseUrl}/api/submissions/${bomSubmission.body.submissionId}/bom/export?format=csv`, {
  headers: { cookie: engineerCookie }
});
const engineerBomExportBytes = new Uint8Array(await engineerBomExportResponse.clone().arrayBuffer());
const engineerBomExportText = await engineerBomExportResponse.text();
results.push(await expectStatus("BOMEXPORT-003 Engineer can export own BOM CSV", engineerBomExportResponse.status, 200));
results.push(
  await expectStatus("BOMEXPORT-004 BOM CSV export uses csv content type", engineerBomExportResponse.headers.get("content-type")?.startsWith("text/csv") ?? false, true)
);
results.push(
  await expectStatus(
    "BOMEXPORT-005 BOM CSV export has UTF-8 BOM",
    engineerBomExportBytes[0] === 0xef && engineerBomExportBytes[1] === 0xbb && engineerBomExportBytes[2] === 0xbf,
    true
  )
);
results.push(
  await expectStatus(
    "BOMEXPORT-006 BOM CSV export contains child and source filename",
    engineerBomExportText.includes(`P-QC-BOM-C1-${bomToken}`) && engineerBomExportText.includes(`QC-BOM-${bomToken}.sldasm`),
    true
  )
);

const managerBomXlsResponse = await fetch(`${baseUrl}/api/submissions/${bomSubmission.body.submissionId}/bom/export?format=xls`, {
  headers: { cookie: managerCookie }
});
const managerBomXlsText = await managerBomXlsResponse.text();
results.push(await expectStatus("BOMEXPORT-007 Manager can export BOM Excel", managerBomXlsResponse.status, 200));
results.push(
  await expectStatus(
    "BOMEXPORT-008 BOM Excel export uses Excel content type",
    managerBomXlsResponse.headers.get("content-type")?.startsWith("application/vnd.ms-excel") ?? false,
    true
  )
);
results.push(
  await expectStatus(
    "BOMEXPORT-009 BOM Excel export uses xls filename and workbook content",
    (managerBomXlsResponse.headers.get("content-disposition")?.includes(".xls") ?? false) &&
      managerBomXlsText.includes("<Workbook") &&
      managerBomXlsText.includes(`P-QC-BOM-C1-${bomToken}`),
    true
  )
);
results.push(
  await expectStatus(
    "BOMEXPORT-010 Engineer cannot export other Engineer BOM",
    (
      await fetch(`${baseUrl}/api/submissions/${otherEngineerSubmission.body.submissionId}/bom/export?format=csv`, {
        headers: { cookie: engineerCookie }
      })
    ).status,
    403
  )
);

const autoBomToken = `${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}`;
const autoBomFilename = `QC-BOM-AUTO-${autoBomToken}.sldasm`;
const autoBomSubmission = await postSubmissionWithFile(
  new File([Buffer.from("qc sldasm auto bom placeholder")], autoBomFilename, { type: "application/octet-stream" }),
  {
    drawing_number: `QC-BOM-AUTO-${autoBomToken}`,
    part_number: `P-QC-BOM-AUTO-${autoBomToken}`,
    document_type: "Assembly"
  },
  engineerCookie,
  [
    {
      sourceFilename: autoBomFilename,
      sourceFileRole: "sldasm",
      referencedFilename: `QC-BOM-AUTO-CHILD-${autoBomToken}.sldprt`,
      referencedPartNumber: `P-QC-BOM-AUTO-C1-${autoBomToken}`,
      referencedDrawingNumber: `D-QC-BOM-AUTO-C1-${autoBomToken}`,
      referencedRevision: "C",
      referenceType: "assembly_component",
      quantity: 3,
      extractionMethod: "qc_payload",
      confidence: "high"
    }
  ]
);
results.push(await expectStatus("BOM-AUTO setup assembly submission returns 201", autoBomSubmission.status, 201));

const autoBomResponse = await fetch(`${baseUrl}/api/submissions/${autoBomSubmission.body.submissionId}/bom`, {
  headers: { cookie: engineerCookie }
});
const autoBomBody = await autoBomResponse.json().catch(() => ({}));
results.push(await expectStatus("BOM-010 submission auto creates BOM draft from references", autoBomResponse.status, 200));
results.push(await expectStatus("BOM-011 auto BOM contains one line", autoBomBody.bom?.lines?.length, 1));
results.push(await expectStatus("BOM-012 auto BOM preserves uploaded reference quantity", autoBomBody.bom?.lines?.[0]?.quantity, 3));

const autoBomDetailResponse = await fetch(`${baseUrl}/api/submissions/${autoBomSubmission.body.submissionId}`, {
  headers: { cookie: engineerCookie }
});
const autoBomDetailBody = await autoBomDetailResponse.json().catch(() => ({}));
results.push(await expectStatus("BOM-013 submission detail exposes auto BOM", autoBomDetailBody.submission?.bom?.lines?.length, 1));

const bomDiffToken = `${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}`;
const bomDiffPartNumber = `P-QC-BOMDIFF-${bomDiffToken}`;
const bomDiffDrawingNumber = `QC-BOMDIFF-${bomDiffToken}`;
const bomDiffBaseFilename = `QC-BOMDIFF-${bomDiffToken}-A.sldasm`;
const bomDiffTargetFilename = `QC-BOMDIFF-${bomDiffToken}-B.sldasm`;
const bomDiffBaseSubmission = await postSubmissionWithFile(
  new File([Buffer.from("qc bom diff base assembly")], bomDiffBaseFilename, { type: "application/octet-stream" }),
  {
    drawing_number: bomDiffDrawingNumber,
    part_number: bomDiffPartNumber,
    revision: "A",
    document_type: "Assembly"
  },
  engineerCookie,
  [
    {
      sourceFilename: bomDiffBaseFilename,
      sourceFileRole: "sldasm",
      referencedFilename: `QC-BOMDIFF-C1-${bomDiffToken}.sldprt`,
      referencedPartNumber: `P-QC-BOMDIFF-C1-${bomDiffToken}`,
      referencedDrawingNumber: `D-QC-BOMDIFF-C1-${bomDiffToken}`,
      referencedRevision: "A",
      referenceType: "assembly_component",
      quantity: 1,
      extractionMethod: "qc_payload",
      confidence: "high"
    },
    {
      sourceFilename: bomDiffBaseFilename,
      sourceFileRole: "sldasm",
      referencedFilename: `QC-BOMDIFF-C2-${bomDiffToken}.sldprt`,
      referencedPartNumber: `P-QC-BOMDIFF-C2-${bomDiffToken}`,
      referencedDrawingNumber: `D-QC-BOMDIFF-C2-${bomDiffToken}`,
      referencedRevision: "A",
      referenceType: "assembly_component",
      quantity: 2,
      extractionMethod: "qc_payload",
      confidence: "high"
    },
    {
      sourceFilename: bomDiffBaseFilename,
      sourceFileRole: "sldasm",
      referencedFilename: `QC-BOMDIFF-C4-${bomDiffToken}.sldprt`,
      referencedPartNumber: `P-QC-BOMDIFF-C4-${bomDiffToken}`,
      referencedDrawingNumber: `D-QC-BOMDIFF-C4-${bomDiffToken}`,
      referencedRevision: "A",
      referenceType: "assembly_component",
      quantity: 4,
      extractionMethod: "qc_payload",
      confidence: "high"
    }
  ]
);
results.push(await expectStatus("BOMDIFF setup base submission returns 201", bomDiffBaseSubmission.status, 201));

const bomDiffTargetSubmission = await postSubmissionWithFile(
  new File([Buffer.from("qc bom diff target assembly")], bomDiffTargetFilename, { type: "application/octet-stream" }),
  {
    drawing_number: bomDiffDrawingNumber,
    part_number: bomDiffPartNumber,
    revision: "B",
    document_type: "Assembly"
  },
  engineerCookie,
  [
    {
      sourceFilename: bomDiffTargetFilename,
      sourceFileRole: "sldasm",
      referencedFilename: `QC-BOMDIFF-C1-${bomDiffToken}.sldprt`,
      referencedPartNumber: `P-QC-BOMDIFF-C1-${bomDiffToken}`,
      referencedDrawingNumber: `D-QC-BOMDIFF-C1-${bomDiffToken}`,
      referencedRevision: "A",
      referenceType: "assembly_component",
      quantity: 1,
      extractionMethod: "qc_payload",
      confidence: "high"
    },
    {
      sourceFilename: bomDiffTargetFilename,
      sourceFileRole: "sldasm",
      referencedFilename: `QC-BOMDIFF-C2-${bomDiffToken}.sldprt`,
      referencedPartNumber: `P-QC-BOMDIFF-C2-${bomDiffToken}`,
      referencedDrawingNumber: `D-QC-BOMDIFF-C2-${bomDiffToken}`,
      referencedRevision: "A",
      referenceType: "assembly_component",
      quantity: 5,
      extractionMethod: "qc_payload",
      confidence: "high"
    },
    {
      sourceFilename: bomDiffTargetFilename,
      sourceFileRole: "sldasm",
      referencedFilename: `QC-BOMDIFF-C3-${bomDiffToken}.sldprt`,
      referencedPartNumber: `P-QC-BOMDIFF-C3-${bomDiffToken}`,
      referencedDrawingNumber: `D-QC-BOMDIFF-C3-${bomDiffToken}`,
      referencedRevision: "A",
      referenceType: "assembly_component",
      quantity: 1,
      extractionMethod: "qc_payload",
      confidence: "high"
    }
  ]
);
results.push(await expectStatus("BOMDIFF setup target submission returns 201", bomDiffTargetSubmission.status, 201));

const aiImpactParentFilename = `QC-AI-IMPACT-PARENT-${bomDiffToken}.sldasm`;
const aiImpactParentSubmission = await postSubmissionWithFile(
  new File([Buffer.from("qc ai impact parent assembly")], aiImpactParentFilename, { type: "application/octet-stream" }),
  {
    drawing_number: `QC-AI-IMPACT-PARENT-${bomDiffToken}`,
    part_number: `P-QC-AI-IMPACT-PARENT-${bomDiffToken}`,
    revision: "A",
    document_type: "Assembly"
  },
  engineerCookie,
  [
    {
      sourceFilename: aiImpactParentFilename,
      sourceFileRole: "sldasm",
      referencedFilename: bomDiffTargetFilename,
      referencedPartNumber: bomDiffPartNumber,
      referencedDrawingNumber: bomDiffDrawingNumber,
      referencedRevision: "B",
      referenceType: "assembly_component",
      quantity: 1,
      extractionMethod: "qc_payload",
      confidence: "high"
    }
  ]
);
results.push(await expectStatus("AI impact setup parent submission returns 201", aiImpactParentSubmission.status, 201));

const aiImpactParent2Filename = `QC-AI-IMPACT-PARENT-2-${bomDiffToken}.sldasm`;
const aiImpactParent2Submission = await postSubmissionWithFile(
  new File([Buffer.from("qc ai impact parent assembly 2")], aiImpactParent2Filename, { type: "application/octet-stream" }),
  {
    drawing_number: `QC-AI-IMPACT-PARENT-2-${bomDiffToken}`,
    part_number: `P-QC-AI-IMPACT-PARENT-2-${bomDiffToken}`,
    revision: "A",
    document_type: "Assembly"
  },
  engineerCookie,
  [
    {
      sourceFilename: aiImpactParent2Filename,
      sourceFileRole: "sldasm",
      referencedFilename: bomDiffTargetFilename,
      referencedPartNumber: bomDiffPartNumber,
      referencedDrawingNumber: bomDiffDrawingNumber,
      referencedRevision: "B",
      referenceType: "assembly_component",
      quantity: 2,
      extractionMethod: "qc_payload",
      confidence: "high"
    }
  ]
);
results.push(await expectStatus("AI impact setup second parent submission returns 201", aiImpactParent2Submission.status, 201));

const unauthBomDiffResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/bom/diff`);
results.push(await expectStatus("BOMDIFF-001 unauthenticated BOM diff returns 401", unauthBomDiffResponse.status, 401));

const defaultBomDiffResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/bom/diff`, {
  headers: { cookie: engineerCookie }
});
const defaultBomDiffBody = await defaultBomDiffResponse.json().catch(() => ({}));
results.push(await expectStatus("BOMDIFF-002 default previous BOM diff returns 200", defaultBomDiffResponse.status, 200));
results.push(await expectStatus("BOMDIFF-003 default diff uses base revision A", defaultBomDiffBody.diff?.base_revision, "A"));
results.push(await expectStatus("BOMDIFF-004 default diff uses target revision B", defaultBomDiffBody.diff?.target_revision, "B"));
results.push(await expectStatus("BOMDIFF-005 default diff changed count", defaultBomDiffBody.diff?.changed_count, 1));
results.push(await expectStatus("BOMDIFF-006 default diff added count", defaultBomDiffBody.diff?.added_count, 1));
results.push(await expectStatus("BOMDIFF-007 default diff removed count", defaultBomDiffBody.diff?.removed_count, 1));
results.push(await expectStatus("BOMDIFF-008 default diff unchanged count", defaultBomDiffBody.diff?.unchanged_count, 1));
results.push(
  await expectStatus(
    "BOMDIFF-009 changed line preserves before and after quantity",
    defaultBomDiffBody.diff?.lines?.some((line) => line.change_type === "changed" && line.from_quantity === 2 && line.to_quantity === 5),
    true
  )
);

const explicitBomDiffResponse = await fetch(
  `${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/bom/diff?baseSubmissionId=${bomDiffBaseSubmission.body.submissionId}`,
  { headers: { cookie: managerCookie } }
);
const explicitBomDiffBody = await explicitBomDiffResponse.json().catch(() => ({}));
results.push(await expectStatus("BOMDIFF-010 explicit base BOM diff returns 200", explicitBomDiffResponse.status, 200));
results.push(await expectStatus("BOMDIFF-011 explicit base comparison is marked explicit", explicitBomDiffBody.comparison, "explicit"));

const crossUserBomDiffResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/bom/diff`, {
  headers: { cookie: engineer2Cookie }
});
results.push(await expectStatus("BOMDIFF-012 Engineer cannot diff another Engineer BOM", crossUserBomDiffResponse.status, 403));

const noPreviousBomDiffResponse = await fetch(`${baseUrl}/api/submissions/${autoBomSubmission.body.submissionId}/bom/diff`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("BOMDIFF-013 BOM diff without previous BOM returns 404", noPreviousBomDiffResponse.status, 404));

const whereUsedChildPartNumber = `P-QC-BOMDIFF-C3-${bomDiffToken}`;
const unauthWhereUsedResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(whereUsedChildPartNumber)}/where-used`);
results.push(await expectStatus("WHEREUSED-001 unauthenticated where-used returns 401", unauthWhereUsedResponse.status, 401));

const engineerWhereUsedResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(whereUsedChildPartNumber)}/where-used`, {
  headers: { cookie: engineerCookie }
});
const engineerWhereUsedBody = await engineerWhereUsedResponse.json().catch(() => ({}));
results.push(await expectStatus("WHEREUSED-002 Engineer where-used returns 200", engineerWhereUsedResponse.status, 200));
results.push(await expectStatus("WHEREUSED-003 Engineer where-used finds one parent", engineerWhereUsedBody.whereUsed?.length, 1));
results.push(
  await expectStatus(
    "WHEREUSED-004 where-used parent is target BOM submission",
    engineerWhereUsedBody.whereUsed?.[0]?.parent_submission_id,
    bomDiffTargetSubmission.body.submissionId
  )
);
results.push(await expectStatus("WHEREUSED-005 where-used preserves quantity", engineerWhereUsedBody.whereUsed?.[0]?.quantity, 1));

const managerWhereUsedResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(whereUsedChildPartNumber)}/where-used`, {
  headers: { cookie: managerCookie }
});
const managerWhereUsedBody = await managerWhereUsedResponse.json().catch(() => ({}));
results.push(await expectStatus("WHEREUSED-006 Manager where-used returns 200", managerWhereUsedResponse.status, 200));
results.push(await expectStatus("WHEREUSED-007 Manager where-used sees parent", managerWhereUsedBody.whereUsed?.length, 1));

const scopedWhereUsedResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(whereUsedChildPartNumber)}/where-used`, {
  headers: { cookie: engineer2Cookie }
});
const scopedWhereUsedBody = await scopedWhereUsedResponse.json().catch(() => ({}));
results.push(await expectStatus("WHEREUSED-008 other Engineer where-used returns 200", scopedWhereUsedResponse.status, 200));
results.push(await expectStatus("WHEREUSED-009 other Engineer where-used is scoped empty", scopedWhereUsedBody.whereUsed?.length, 0));

const unusedWhereUsedResponse = await fetch(`${baseUrl}/api/items/${encodeURIComponent(`P-QC-WHEREUSED-UNUSED-${bomDiffToken}`)}/where-used`, {
  headers: { cookie: engineerCookie }
});
const unusedWhereUsedBody = await unusedWhereUsedResponse.json().catch(() => ({}));
results.push(await expectStatus("WHEREUSED-010 unused part where-used returns 200", unusedWhereUsedResponse.status, 200));
results.push(await expectStatus("WHEREUSED-011 unused part where-used is empty", unusedWhereUsedBody.whereUsed?.length, 0));

const unauthSummaryResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/ai-summary`);
results.push(await expectStatus("SUMMARY-001 unauthenticated AI summary returns 401", unauthSummaryResponse.status, 401));

const engineerSummaryResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/ai-summary`, {
  headers: { cookie: engineerCookie }
});
const engineerSummaryBody = await engineerSummaryResponse.json().catch(() => ({}));
const summarySectionKeys = new Set(engineerSummaryBody.summary?.sections?.map((section) => section.key) ?? []);
const summarySourceTypes = new Set(engineerSummaryBody.summary?.sources?.map((source) => source.type) ?? []);
results.push(await expectStatus("SUMMARY-002 Engineer can read own AI summary", engineerSummaryResponse.status, 200));
results.push(await expectStatus("SUMMARY-003 AI summary includes change reason", summarySectionKeys.has("change_reason"), true));
results.push(await expectStatus("SUMMARY-004 AI summary includes files", summarySectionKeys.has("files"), true));
results.push(await expectStatus("SUMMARY-005 AI summary includes revision history", summarySectionKeys.has("revision_history"), true));
results.push(await expectStatus("SUMMARY-006 AI summary includes BOM diff", summarySectionKeys.has("bom_diff"), true));
results.push(await expectStatus("SUMMARY-007 AI summary includes Where-used", summarySectionKeys.has("where_used"), true));
results.push(await expectStatus("SUMMARY-008 AI summary includes missing files", summarySectionKeys.has("missing_files"), true));
results.push(await expectStatus("SUMMARY-009 AI summary reports missing DWG", engineerSummaryBody.summary?.missing_file_roles?.includes("dwg"), true));
results.push(await expectStatus("SUMMARY-010 AI summary has traceable BOM and Where-used sources", summarySourceTypes.has("bom") && summarySourceTypes.has("where_used"), true));

const managerSummaryResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/ai-summary`, {
  headers: { cookie: managerCookie }
});
results.push(await expectStatus("SUMMARY-011 Manager can read AI summary", managerSummaryResponse.status, 200));

const otherEngineerSummaryResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/ai-summary`, {
  headers: { cookie: engineer2Cookie }
});
results.push(await expectStatus("SUMMARY-012 Engineer cannot read other Engineer AI summary", otherEngineerSummaryResponse.status, 403));

const unauthRiskResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/ai-risks`);
results.push(await expectStatus("RISK-001 unauthenticated AI risks return 401", unauthRiskResponse.status, 401));

const engineerRiskResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/ai-risks`, {
  headers: { cookie: engineerCookie }
});
const engineerRiskBody = await engineerRiskResponse.json().catch(() => ({}));
const engineerRiskCodes = new Set(engineerRiskBody.report?.risks?.map((risk) => risk.code) ?? []);
const whereUsedRisk = engineerRiskBody.report?.risks?.find((risk) => risk.code === "where_used_impact");
results.push(await expectStatus("RISK-002 Engineer can read own AI risks", engineerRiskResponse.status, 200));
results.push(await expectStatus("RISK-003 AI risks detect missing handoff file", engineerRiskCodes.has("missing_handoff_file"), true));
results.push(await expectStatus("RISK-004 AI risks detect multi-parent Where-used", engineerRiskCodes.has("where_used_impact"), true));
results.push(await expectStatus("RISK-005 Where-used risk has traceable sources", (whereUsedRisk?.sources?.length ?? 0) >= 2, true));

const baseRiskResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffBaseSubmission.body.submissionId}/ai-risks`, {
  headers: { cookie: engineerCookie }
});
const baseRiskBody = await baseRiskResponse.json().catch(() => ({}));
results.push(
  await expectStatus(
    "RISK-006 older submission detects newer revision",
    baseRiskBody.report?.risks?.some((risk) => risk.code === "newer_revision_exists"),
    true
  )
);

const managerRiskResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/ai-risks`, {
  headers: { cookie: managerCookie }
});
results.push(await expectStatus("RISK-007 Manager can read AI risks", managerRiskResponse.status, 200));

const otherEngineerRiskResponse = await fetch(`${baseUrl}/api/submissions/${bomDiffTargetSubmission.body.submissionId}/ai-risks`, {
  headers: { cookie: engineer2Cookie }
});
results.push(await expectStatus("RISK-008 Engineer cannot read other Engineer AI risks", otherEngineerRiskResponse.status, 403));

const orphansBeforeDuplicate = findOrphanRepositoryFiles().length;
const duplicate = await postSubmission({
  drawing_number: duplicateSeed.data.drawing_number,
  part_number: `P-DUP-${Date.now().toString().slice(-6)}`,
  revision: duplicateSeed.data.revision
});
results.push(await expectStatus("DB-003 duplicate drawing_number + revision returns 409", duplicate.status, 409));
const orphansAfterDuplicate = findOrphanRepositoryFiles().length;
results.push(
  await expectStatus(
    "QC-P1-001 duplicate rejection does not create orphan files",
    orphansAfterDuplicate,
    orphansBeforeDuplicate
  )
);

const releasable = await postSubmission();
results.push(await expectStatus("WF setup pending submission returns 201", releasable.status, 201));

const unauthShareListResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/shares`);
results.push(await expectStatus("SHARE-001 unauthenticated share list returns 401", unauthShareListResponse.status, 401));

const engineerShareCreateResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/shares`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ label: "QC engineer share attempt", days: 7 })
});
results.push(await expectStatus("SHARE-002 Engineer cannot create read-only share", engineerShareCreateResponse.status, 403));

const pendingShareCreateResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/shares`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ label: "QC pending share attempt", days: 7 })
});
results.push(await expectStatus("SHARE-003 Manager cannot create share for Pending submission", pendingShareCreateResponse.status, 409));

const aiApprove = await postChat("Please approve this submission now", { currentSubmissionId: releasable.body.submissionId });
results.push(await expectStatus("AI-005 approve request is blocked", aiApprove.body.answer?.includes("AI_ACTION_BLOCKED") ?? false, true));

const aiReject = await postChat("Please reject this submission now", { currentSubmissionId: releasable.body.submissionId });
results.push(await expectStatus("AI-006 reject request is blocked", aiReject.body.answer?.includes("AI_ACTION_BLOCKED") ?? false, true));

const aiDelete = await postChat("Please delete this submission now", { currentSubmissionId: releasable.body.submissionId });
results.push(await expectStatus("AI-007 delete request is blocked", aiDelete.body.answer?.includes("AI_ACTION_BLOCKED") ?? false, true));

const aiRevise = await postChat("Please revise this drawing to revision B now", { currentSubmissionId: releasable.body.submissionId });
results.push(await expectStatus("AI-008 revise request is blocked", aiRevise.body.answer?.includes("AI_ACTION_BLOCKED") ?? false, true));

const chatSeed = await postChat("summary", {}, managerCookie);
results.push(await expectStatus("AI-009 chat creates conversation", Boolean(chatSeed.body.conversationId), true));
results.push(await expectStatus("AI-010 chat writes user and assistant messages", getConversationMessageCount(chatSeed.body.conversationId), 2));
results.push(await expectStatus("AI-011 summary chat returns source list", Array.isArray(chatSeed.body.sources) && chatSeed.body.sources.length > 0, true));

const detailChat = await postChat("tool: get_submission_detail", { currentSubmissionId: releasable.body.submissionId }, managerCookie);
results.push(await expectStatus("AI-012 detail tool returns sources", Array.isArray(detailChat.body.sources) && detailChat.body.sources.some((source) => source.label === releasable.body.submissionId), true));

const aiImpactChat = await postChat("tool: get_submission_detail", { currentSubmissionId: bomDiffTargetSubmission.body.submissionId }, managerCookie);
results.push(await expectStatus("AI-022 contextual AI summary includes BOM diff", aiImpactChat.body.answer?.includes("BOM diff：新增 1，移除 1，變更 1，未變 1") ?? false, true));
results.push(await expectStatus("AI-023 contextual AI summary includes Where-used impact", aiImpactChat.body.answer?.includes("Where-used：此料號目前被 2 個上層 BOM 使用") ?? false, true));
results.push(await expectStatus("AI-024 contextual AI summary includes missing file hints", aiImpactChat.body.answer?.includes("缺漏檔案提示：缺 PDF、缺 DWG") ?? false, true));
results.push(await expectStatus("AI-025 contextual AI summary returns BOM source", aiImpactChat.body.sources?.some((source) => source.type === "bom") ?? false, true));
results.push(await expectStatus("AI-026 contextual AI summary returns Where-used source", aiImpactChat.body.sources?.some((source) => source.type === "where_used") ?? false, true));

const chatFollowUp = await postChat("pending", {}, managerCookie, chatSeed.body.conversationId);
results.push(await expectStatus("AI-013 chat continues same conversation", chatFollowUp.body.conversationId, chatSeed.body.conversationId));
results.push(await expectStatus("AI-014 chat follow-up appends messages", getConversationMessageCount(chatSeed.body.conversationId), 4));

const crossUserChat = await postChat("summary", {}, engineerCookie, chatSeed.body.conversationId);
results.push(await expectStatus("AI-015 cross-user conversation access returns 403", crossUserChat.status, 403));

const allowedToolChat = await postChat("tool: get_dashboard_metrics", {}, managerCookie);
results.push(await expectStatus("AI-016 whitelisted AI tool request returns 200", allowedToolChat.status, 200));
results.push(await expectStatus("AI-017 whitelisted AI tool is not blocked", allowedToolChat.body.answer?.includes("AI_TOOL_BLOCKED") ?? true, false));
results.push(await expectStatus("AI-018 whitelisted AI tool returns sources", Array.isArray(allowedToolChat.body.sources) && allowedToolChat.body.sources.length > 0, true));

const blockedToolChat = await postChat("tool: approve_submission", {}, managerCookie);
results.push(await expectStatus("AI-019 non-whitelisted AI tool is blocked", blockedToolChat.body.answer?.includes("AI_TOOL_BLOCKED") ?? false, true));

const policyRagChat = await postChat("drawing revision policy", {}, managerCookie);
results.push(await expectStatus("AI-020 policy RAG returns policy source", policyRagChat.body.sources?.some((source) => source.detail?.includes(".ai-doc/reference/pdm-management-policy-draft.md")) ?? false, true));
results.push(await expectStatus("AI-021 policy RAG answer includes matching rule", policyRagChat.body.answer?.includes("drawing_number + revision") ?? false, true));

const engineerApproveResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: engineerCookie },
  body: JSON.stringify({ comment: "Engineer should not approve" })
});
results.push(await expectStatus("AUTH-002 Engineer approve returns 403", engineerApproveResponse.status, 403));

const twoReviewer = await postSubmission({
  drawing_number: `QC-2R-${Date.now().toString().slice(-6)}`,
  part_number: `P-QC-2R-${Date.now().toString().slice(-6)}`,
  approval_required: "2"
});
results.push(await expectStatus("WF-005 two-reviewer setup submission returns 201", twoReviewer.status, 201));

const firstTwoReviewerApproval = await fetch(`${baseUrl}/api/submissions/${twoReviewer.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "First reviewer approve" })
});
const firstTwoReviewerApprovalBody = await firstTwoReviewerApproval.json().catch(() => ({}));
results.push(await expectStatus("WF-006 first two-reviewer approval returns 200", firstTwoReviewerApproval.status, 200));
results.push(await expectStatus("WF-007 first two-reviewer approval keeps Pending", firstTwoReviewerApprovalBody.status, "Pending"));

const duplicateTwoReviewerApproval = await fetch(`${baseUrl}/api/submissions/${twoReviewer.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "Duplicate reviewer approve" })
});
results.push(await expectStatus("WF-008 duplicate reviewer approval returns 409", duplicateTwoReviewerApproval.status, 409));

const secondTwoReviewerApproval = await fetch(`${baseUrl}/api/submissions/${twoReviewer.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: adminCookie },
  body: JSON.stringify({ comment: "Second reviewer approve" })
});
const secondTwoReviewerApprovalBody = await secondTwoReviewerApproval.json().catch(() => ({}));
results.push(await expectStatus("WF-009 second two-reviewer approval returns 200", secondTwoReviewerApproval.status, 200));
results.push(await expectStatus("WF-010 second two-reviewer approval releases", secondTwoReviewerApprovalBody.status, "Released"));

const duplicateReleaseFilename = `QC-RELEASE-DUP-${Date.now().toString().slice(-6)}-${Math.random().toString(16).slice(2, 6)}.pdf`;
const firstReleaseFilenameSubmission = await postSubmissionWithFile(
  new File([Buffer.from("first released duplicate filename")], duplicateReleaseFilename, { type: "application/pdf" }),
  {
    drawing_number: `QC-REL-A-${Date.now().toString().slice(-6)}`,
    part_number: `P-QC-REL-A-${Date.now().toString().slice(-6)}`
  }
);
results.push(await expectStatus("REL-001 first duplicate filename setup returns 201", firstReleaseFilenameSubmission.status, 201));
const firstReleaseFilenameApproval = await approveSubmission(firstReleaseFilenameSubmission.body.submissionId, managerCookie, "Release first duplicate filename seed");
results.push(await expectStatus("REL-002 first duplicate filename release returns Released", firstReleaseFilenameApproval.body.status, "Released"));

const secondReleaseFilenameSubmission = await postSubmissionWithFile(
  new File([Buffer.from("second released duplicate filename")], duplicateReleaseFilename, { type: "application/pdf" }),
  {
    drawing_number: `QC-REL-B-${Date.now().toString().slice(-6)}`,
    part_number: `P-QC-REL-B-${Date.now().toString().slice(-6)}`
  }
);
results.push(await expectStatus("REL-003 second duplicate filename setup returns 201", secondReleaseFilenameSubmission.status, 201));
const duplicateFilenameRiskResponse = await fetch(`${baseUrl}/api/submissions/${secondReleaseFilenameSubmission.body.submissionId}/ai-risks`, {
  headers: { cookie: engineerCookie }
});
const duplicateFilenameRiskBody = await duplicateFilenameRiskResponse.json().catch(() => ({}));
results.push(await expectStatus("RISK-009 pending duplicate Released filename risks return 200", duplicateFilenameRiskResponse.status, 200));
results.push(
  await expectStatus(
    "RISK-010 AI risks detect Released filename conflict",
    duplicateFilenameRiskBody.report?.risks?.some((risk) => risk.code === "released_filename_conflict"),
    true
  )
);
const duplicateFilenameRiskDetailResponse = await fetch(`${baseUrl}/api/submissions/${secondReleaseFilenameSubmission.body.submissionId}`, {
  headers: { cookie: engineerCookie }
});
const duplicateFilenameRiskDetailBody = await duplicateFilenameRiskDetailResponse.json().catch(() => ({}));
results.push(await expectStatus("RISK-011 AI risks keep submission Pending", duplicateFilenameRiskDetailBody.submission?.status, "Pending"));
const secondReleaseFilenameApproval = await approveSubmission(secondReleaseFilenameSubmission.body.submissionId, managerCookie, "Release duplicate filename should fail");
results.push(await expectStatus("REL-004 duplicate Released filename returns 500", secondReleaseFilenameApproval.status, 500));
results.push(
  await expectStatus(
    "REL-005 duplicate Released filename is blocked",
    secondReleaseFilenameApproval.body.error?.includes("DUPLICATE_RELEASE_FILENAME") ?? false,
    true
  )
);

const releaseFailedNotifications = await getNotifications(managerCookie);
results.push(
  await expectStatus(
    "NOTIFY-008 manager notifications include ReleaseFailed",
    releaseFailedNotifications.body.notifications?.some(
      (notification) =>
        notification.kind === "release_failed" &&
        notification.severity === "critical" &&
        notification.submission_id === secondReleaseFilenameSubmission.body.submissionId
    ) ?? false,
    true
  )
);
results.push(
  await expectStatus(
    "NOTIFY-009 notifications summary counts critical items",
    (releaseFailedNotifications.body.summary?.critical ?? 0) > 0,
    true
  )
);

const approveResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC approve" })
});
const approveBody = await approveResponse.json().catch(() => ({}));
results.push(await expectStatus("WF-001 approve Pending returns 200", approveResponse.status, 200));
results.push(await expectStatus("PKG-001 approve creates release package", Boolean(approveBody.release?.package?.sha256), true));

const releasedDetailResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}`, {
  headers: { cookie: managerCookie }
});
const releasedDetailBody = await releasedDetailResponse.json().catch(() => ({}));
results.push(await expectStatus("PKG-002 released detail exposes package metadata", Boolean(releasedDetailBody.submission?.release_package?.sha256), true));

const unauthPackageResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/release-package`);
results.push(await expectStatus("PKG-003 unauthenticated package download returns 401", unauthPackageResponse.status, 401));

const packageResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/release-package`, {
  headers: { cookie: managerCookie, ...qcStorageAuditHeaders }
});
const packageBytes = Buffer.from(await packageResponse.arrayBuffer());
results.push(await expectStatus("PKG-004 package download returns 200", packageResponse.status, 200));
results.push(await expectStatus("PKG-005 package content type is zip", packageResponse.headers.get("content-type"), "application/zip"));
results.push(await expectStatus("PKG-006 package has zip signature", packageBytes.subarray(0, 2).toString("utf8"), "PK"));
results.push(await expectStatus("PKG-007 package contains manifest", packageBytes.includes(Buffer.from("manifest.json")), true));
results.push(await expectStatus("PKG-008 package manifest contains drawing number", packageBytes.includes(Buffer.from(releasable.data.drawing_number)), true));

const releasePackageAudits = getStorageAccessAudits(releasable.body.submissionId);
const releasePackageAudit = releasePackageAudits.find((audit) => audit.detail.accessKind === "release_package");
results.push(await expectStatus("PKG-009 package download writes StorageAccessed audit", Boolean(releasePackageAudit), true));
results.push(await expectStatus("PKG-010 package audit records release route", releasePackageAudit?.detail.route, "/api/submissions/[id]/release-package"));
results.push(await expectStatus("PKG-011 package audit records attachment disposition", releasePackageAudit?.detail.disposition, "attachment"));
results.push(await expectStatus("PKG-012 package audit records positive byte count", Number(releasePackageAudit?.detail.bytes ?? 0) > 0, true));
results.push(await expectStatus("PKG-013 package audit records QC runtime provenance", storageAuditHasExpectedProvenance(releasePackageAudit), true));

const shareCreateResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/shares`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ label: "QC supplier package review", days: 7 })
});
const shareCreateBody = await shareCreateResponse.json().catch(() => ({}));
results.push(await expectStatus("SHARE-004 Manager creates read-only share for Released submission", shareCreateResponse.status, 201));
results.push(
  await expectStatus(
    "SHARE-005 create response returns public URL/token once",
    Boolean(shareCreateBody.public_url?.includes("/share/") && shareCreateBody.token && shareCreateBody.share?.id),
    true
  )
);

const shareListResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/shares`, {
  headers: { cookie: managerCookie }
});
const shareListBody = await shareListResponse.json().catch(() => ({}));
const createdShare = shareListBody.shares?.find((share) => share.id === shareCreateBody.share?.id);
results.push(
  await expectStatus(
    "SHARE-006 manager list shows created share without token hash",
    Boolean(createdShare && !("token_hash" in createdShare) && !("token" in createdShare)),
    true
  )
);

const publicShareResponse = await fetch(`${baseUrl}/api/public/shares/${shareCreateBody.token}`);
const publicShareText = await publicShareResponse.text();
const publicShareBody = JSON.parse(publicShareText || "{}");
results.push(await expectStatus("SHARE-007 public share metadata is accessible without auth", publicShareResponse.status, 200));
results.push(
  await expectStatus(
    "SHARE-008 public share response excludes local paths, token hash and audit logs",
    !publicShareText.includes("local_path") && !publicShareText.includes("token_hash") && !publicShareText.includes("audit_logs"),
    true
  )
);
results.push(
  await expectStatus(
    "SHARE-009 public share exposes released drawing and package URL",
    publicShareBody.submission?.drawing_number === releasable.data.drawing_number &&
      publicShareBody.package?.download_url === `/api/public/shares/${shareCreateBody.token}/package`,
    true
  )
);

const publicPackageResponse = await fetch(`${baseUrl}/api/public/shares/${shareCreateBody.token}/package`, {
  headers: qcStorageAuditHeaders
});
const publicPackageBytes = Buffer.from(await publicPackageResponse.arrayBuffer());
results.push(await expectStatus("SHARE-010 public package download returns ZIP", publicPackageResponse.status, 200));
results.push(await expectStatus("SHARE-011 public package has zip signature", publicPackageBytes.subarray(0, 2).toString("utf8"), "PK"));

const packageShareAudits = getStorageAccessAudits(releasable.body.submissionId);
const publicPackageAudit = packageShareAudits.find((audit) => audit.detail.accessKind === "public_share_package" && audit.detail.shareId === shareCreateBody.share?.id);
const packageShareAuditText = JSON.stringify(packageShareAudits);
results.push(await expectStatus("SHARE-012 public package writes StorageAccessed audit", Boolean(publicPackageAudit), true));
results.push(await expectStatus("SHARE-013 public package audit records route", publicPackageAudit?.detail.route, "/api/public/shares/[token]/package"));
results.push(await expectStatus("SHARE-014 public package audit records external access", publicPackageAudit?.detail.externalAccess, true));
results.push(await expectStatus("SHARE-015 public package audit records positive byte count", Number(publicPackageAudit?.detail.bytes ?? 0) > 0, true));
results.push(await expectStatus("SHARE-016 public package audit records QC runtime provenance", storageAuditHasExpectedProvenance(publicPackageAudit), true));
results.push(
  await expectStatus(
    "SHARE-016A public package audit redacts raw token material",
    !packageShareAuditText.includes(shareCreateBody.token) && !packageShareAuditText.includes("token_hash") && !packageShareAuditText.includes('"url"'),
    true
  )
);

const supplierInvalidTokenResponse = await fetch(`${baseUrl}/api/public/shares/not-a-valid-token/responses`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ responseKind: "question", supplierName: "QC Supplier", supplierEmail: "supplier@example.com", message: "Need drawing note detail." })
});
results.push(await expectStatus("SUPPLIER-001 invalid supplier portal token returns 404", supplierInvalidTokenResponse.status, 404));

const supplierBadPayloadResponse = await fetch(`${baseUrl}/api/public/shares/${shareCreateBody.token}/responses`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ responseKind: "question", supplierName: "Q", supplierEmail: "bad-email", message: "" })
});
results.push(await expectStatus("SUPPLIER-002 invalid supplier response payload returns 400", supplierBadPayloadResponse.status, 400));

const supplierResponse = await fetch(`${baseUrl}/api/public/shares/${shareCreateBody.token}/responses`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    responseKind: "question",
    supplierName: "QC Supplier",
    supplierEmail: "supplier@example.com",
    message: "Can this package be used for first article inspection?"
  })
});
const supplierResponseBody = await supplierResponse.json().catch(() => ({}));
const supplierResponseId = typeof supplierResponseBody.response?.id === "string" ? supplierResponseBody.response.id : "";
results.push(await expectStatus("SUPPLIER-003 public supplier response returns 201", supplierResponse.status, 201));
results.push(await expectStatus("SUPPLIER-004 public supplier response starts open", supplierResponseBody.response?.status, "open"));
results.push(await expectStatus("SUPPLIER-004A public supplier response returns an id", supplierResponseId.length > 0, true));

const publicShareAfterSupplierResponse = await fetch(`${baseUrl}/api/public/shares/${shareCreateBody.token}`);
const publicShareAfterSupplierBody = await publicShareAfterSupplierResponse.json().catch(() => ({}));
results.push(
  await expectStatus(
    "SUPPLIER-005 public portal shows supplier response",
    Boolean(supplierResponseId) && publicShareAfterSupplierBody.supplier_responses?.some((response) => response.id === supplierResponseId),
    true
  )
);

const engineerSupplierListResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/supplier-responses`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("SUPPLIER-006 Engineer cannot list supplier responses", engineerSupplierListResponse.status, 403));

const managerSupplierListResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/supplier-responses`, {
  headers: { cookie: managerCookie }
});
const managerSupplierListBody = await managerSupplierListResponse.json().catch(() => ({}));
const listedSupplierResponse = managerSupplierListBody.responses?.find((response) => response.id === supplierResponseId);
const closeSupplierResponseId = listedSupplierResponse?.id ?? supplierResponseId;
results.push(await expectStatus("SUPPLIER-007 Manager lists supplier responses", managerSupplierListResponse.status, 200));
results.push(
  await expectStatus(
    "SUPPLIER-008 Manager list includes supplier response",
    Boolean(listedSupplierResponse),
    true
  )
);

const managerCloseSupplierResponse = await fetch(
  `${baseUrl}/api/submissions/${releasable.body.submissionId}/supplier-responses/${closeSupplierResponseId}`,
  {
    method: "PATCH",
    headers: { cookie: managerCookie }
  }
);
const managerCloseSupplierBody = await managerCloseSupplierResponse.json().catch(() => ({}));
results.push(await expectStatus("SUPPLIER-009 Manager closes supplier response", managerCloseSupplierResponse.status, 200));
results.push(await expectStatus("SUPPLIER-010 closed supplier response status", managerCloseSupplierBody.response?.status, "closed"));

const duplicateCloseSupplierResponse = await fetch(
  `${baseUrl}/api/submissions/${releasable.body.submissionId}/supplier-responses/${closeSupplierResponseId}`,
  {
    method: "PATCH",
    headers: { cookie: managerCookie }
  }
);
results.push(await expectStatus("SUPPLIER-011 closing supplier response twice returns 409", duplicateCloseSupplierResponse.status, 409));

const shareRevokeResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/shares/${shareCreateBody.share?.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ revoked: true })
});
results.push(await expectStatus("SHARE-017 manager revokes share", shareRevokeResponse.status, 200));

const revokedPublicShareResponse = await fetch(`${baseUrl}/api/public/shares/${shareCreateBody.token}`);
results.push(await expectStatus("SHARE-018 revoked public share metadata returns 404", revokedPublicShareResponse.status, 404));

const revokedPublicPackageResponse = await fetch(`${baseUrl}/api/public/shares/${shareCreateBody.token}/package`);
results.push(await expectStatus("SHARE-019 revoked public package download returns 404", revokedPublicPackageResponse.status, 404));

const unauthHandoffResponse = await fetch(`${baseUrl}/api/handoff`);
results.push(await expectStatus("HANDOFF-001 unauthenticated handoff returns 401", unauthHandoffResponse.status, 401));

const handoffResponse = await fetch(`${baseUrl}/api/handoff`, { headers: { cookie: managerCookie } });
const handoffBody = await handoffResponse.json().catch(() => ({}));
const handoffEntry = handoffBody.entries?.find((entry) => entry.id === releasable.body.submissionId);
results.push(await expectStatus("HANDOFF-002 manager handoff returns 200", handoffResponse.status, 200));
results.push(await expectStatus("HANDOFF-003 handoff includes released latest entry", Boolean(handoffEntry), true));
results.push(await expectStatus("HANDOFF-004 handoff entry exposes package download", Boolean(handoffEntry?.package?.download_url), true));
results.push(await expectStatus("HANDOFF-005 handoff entry exposes file hashes", Boolean(handoffEntry?.files?.[0]?.sha256), true));
results.push(await expectStatus("HANDOFF-006 handoff entry exposes approvals", Boolean(handoffEntry?.approvals?.[0]?.reviewer_name), true));

const unauthHandoffExportResponse = await fetch(`${baseUrl}/api/handoff/export`);
results.push(await expectStatus("HANDOFF-007 unauthenticated handoff CSV export returns 401", unauthHandoffExportResponse.status, 401));

const handoffExportResponse = await fetch(`${baseUrl}/api/handoff/export`, { headers: { cookie: managerCookie } });
const handoffExportText = await handoffExportResponse.text();
results.push(await expectStatus("HANDOFF-008 manager handoff CSV export returns 200", handoffExportResponse.status, 200));
results.push(
  await expectStatus("HANDOFF-009 handoff CSV export uses csv content type", handoffExportResponse.headers.get("content-type")?.startsWith("text/csv") ?? false, true)
);
results.push(await expectStatus("HANDOFF-010 handoff CSV export contains drawing number", handoffExportText.includes(releasable.data.drawing_number), true));
results.push(await expectStatus("HANDOFF-011 handoff CSV export contains package filename", handoffExportText.includes(handoffEntry?.package?.filename ?? ""), true));

const unauthProcurementResponse = await fetch(`${baseUrl}/api/integrations/procurement/releases`);
results.push(await expectStatus("PROCAPI-001 unauthenticated procurement releases returns 401", unauthProcurementResponse.status, 401));

const engineerProcurementResponse = await fetch(`${baseUrl}/api/integrations/procurement/releases`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("PROCAPI-002 Engineer procurement releases returns 403", engineerProcurementResponse.status, 403));

const managerProcurementResponse = await fetch(`${baseUrl}/api/integrations/procurement/releases`, {
  headers: { cookie: managerCookie }
});
const managerProcurementText = await managerProcurementResponse.text();
const managerProcurementBody = JSON.parse(managerProcurementText || "{}");
const procurementEntry = managerProcurementBody.entries?.find((entry) => entry.submission_id === releasable.body.submissionId);
results.push(await expectStatus("PROCAPI-003 Manager procurement releases returns 200", managerProcurementResponse.status, 200));
results.push(
  await expectStatus(
    "PROCAPI-004 response includes released submission and package metadata",
    Boolean(procurementEntry?.package?.sha256 && procurementEntry?.released_at),
    true
  )
);
results.push(
  await expectStatus(
    "PROCAPI-005 response includes file hashes and BOM payload shape",
    Boolean(procurementEntry?.files?.[0]?.sha256 && "bom" in procurementEntry),
    true
  )
);
results.push(
  await expectStatus(
    "PROCAPI-006 response excludes local paths, token hash and audit logs",
    !managerProcurementText.includes("local_path") && !managerProcurementText.includes("token_hash") && !managerProcurementText.includes("audit_logs"),
    true
  )
);

const partFilteredProcurementResponse = await fetch(
  `${baseUrl}/api/integrations/procurement/releases?partNumber=${encodeURIComponent(releasable.data.part_number)}`,
  { headers: { cookie: managerCookie } }
);
const partFilteredProcurementBody = await partFilteredProcurementResponse.json().catch(() => ({}));
results.push(
  await expectStatus(
    "PROCAPI-007 partNumber filter returns the target release",
    partFilteredProcurementBody.entries?.some((entry) => entry.submission_id === releasable.body.submissionId) ?? false,
    true
  )
);

const futureSince = encodeURIComponent(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
const futureProcurementResponse = await fetch(`${baseUrl}/api/integrations/procurement/releases?since=${futureSince}`, {
  headers: { cookie: managerCookie }
});
const futureProcurementBody = await futureProcurementResponse.json().catch(() => ({}));
results.push(await expectStatus("PROCAPI-008 future since filter returns empty result", futureProcurementBody.count, 0));

const unauthSyncRunsResponse = await fetch(`${baseUrl}/api/integrations/procurement/sync-runs`);
results.push(await expectStatus("ERPSYNC-001 unauthenticated sync runs returns 401", unauthSyncRunsResponse.status, 401));

const engineerSyncRunsResponse = await fetch(`${baseUrl}/api/integrations/procurement/sync-runs`, {
  headers: { cookie: engineerCookie }
});
results.push(await expectStatus("ERPSYNC-002 Engineer sync runs returns 403", engineerSyncRunsResponse.status, 403));

const pendingSyncSeed = await postSubmission({
  drawing_number: `QC-ERPSYNC-P-${Date.now().toString().slice(-6)}`,
  part_number: `P-QC-ERPSYNC-P-${Date.now().toString().slice(-6)}`
});
const pendingSyncResponse = await fetch(`${baseUrl}/api/integrations/procurement/sync-runs`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ submissionId: pendingSyncSeed.body.submissionId, targetSystem: "ERP" })
});
results.push(await expectStatus("ERPSYNC-003 Pending submission cannot be synced", pendingSyncResponse.status, 409));

const createSyncRunResponse = await fetch(`${baseUrl}/api/integrations/procurement/sync-runs`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ submissionId: releasable.body.submissionId, targetSystem: "ERP", externalReference: "ERP-QC-001" })
});
const createSyncRunBody = await createSyncRunResponse.json().catch(() => ({}));
results.push(await expectStatus("ERPSYNC-004 Manager creates ERP sync run", createSyncRunResponse.status, 201));
results.push(await expectStatus("ERPSYNC-005 ERP sync run starts sent", createSyncRunBody.run?.status, "sent"));
results.push(await expectStatus("ERPSYNC-006 ERP sync payload includes package", Boolean(createSyncRunBody.run?.payload_json?.includes("package")), true));

const listSyncRunsResponse = await fetch(`${baseUrl}/api/integrations/procurement/sync-runs?submissionId=${releasable.body.submissionId}`, {
  headers: { cookie: managerCookie }
});
const listSyncRunsBody = await listSyncRunsResponse.json().catch(() => ({}));
results.push(await expectStatus("ERPSYNC-007 Manager lists sync runs", listSyncRunsResponse.status, 200));
results.push(
  await expectStatus(
    "ERPSYNC-008 sync run list includes created run",
    listSyncRunsBody.runs?.some((run) => run.id === createSyncRunBody.run?.id),
    true
  )
);

const acknowledgeSyncRunResponse = await fetch(`${baseUrl}/api/integrations/procurement/sync-runs/${createSyncRunBody.run?.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ action: "acknowledge", externalReference: "ERP-QC-ACK-001", message: "ERP accepted release" })
});
const acknowledgeSyncRunBody = await acknowledgeSyncRunResponse.json().catch(() => ({}));
results.push(await expectStatus("ERPSYNC-009 Manager acknowledges ERP sync run", acknowledgeSyncRunResponse.status, 200));
results.push(await expectStatus("ERPSYNC-010 acknowledged sync run status", acknowledgeSyncRunBody.run?.status, "acknowledged"));
results.push(await expectStatus("ERPSYNC-011 acknowledged sync run keeps external ref", acknowledgeSyncRunBody.run?.external_reference, "ERP-QC-ACK-001"));

const duplicateAcknowledgeSyncRunResponse = await fetch(`${baseUrl}/api/integrations/procurement/sync-runs/${createSyncRunBody.run?.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ action: "acknowledge", message: "Duplicate acknowledgement" })
});
results.push(await expectStatus("ERPSYNC-012 acknowledging sync run twice returns 409", duplicateAcknowledgeSyncRunResponse.status, 409));

const approveAgainResponse = await fetch(`${baseUrl}/api/submissions/${releasable.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC approve again" })
});
results.push(await expectStatus("WF-003 approve Released returns 409", approveAgainResponse.status, 409));

const rejectable = await postSubmission();
results.push(await expectStatus("WF setup rejectable submission returns 201", rejectable.status, 201));

const rejectResponse = await fetch(`${baseUrl}/api/submissions/${rejectable.body.submissionId}/reject`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ reason: "QC reject" })
});
results.push(await expectStatus("WF-002 reject Pending returns 200", rejectResponse.status, 200));

const approveRejectedResponse = await fetch(`${baseUrl}/api/submissions/${rejectable.body.submissionId}/approve`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: managerCookie },
  body: JSON.stringify({ comment: "QC approve rejected" })
});
results.push(await expectStatus("WF-004 approve Rejected returns 409", approveRejectedResponse.status, 409));

// Test Bearer Token auth
const tokenResponse = await fetch(`${baseUrl}/api/auth/token`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "engineer@example.com", password: demoPassword })
});
const tokenBody = await tokenResponse.json().catch(() => ({}));
results.push(await expectStatus("BEARER-001 POST /api/auth/token returns 200", tokenResponse.status, 200));
results.push(await expectStatus("BEARER-002 POST /api/auth/token contains token string", typeof tokenBody.token, "string"));

const bearerToken = tokenBody.token || "";

const bearerSubmissions = await fetch(`${baseUrl}/api/submissions?status=Pending`, {
  headers: { "Authorization": `Bearer ${bearerToken}` }
});
results.push(await expectStatus("BEARER-003 get submissions using Bearer Token returns 200", bearerSubmissions.status, 200));

const badBearerSubmissions = await fetch(`${baseUrl}/api/submissions?status=Pending`, {
  headers: { "Authorization": "Bearer invalid-token-string" }
});
results.push(await expectStatus("BEARER-004 get submissions using invalid Bearer Token returns 401", badBearerSubmissions.status, 401));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
