import path from "node:path";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-8);
const results = [];
const createdSubmissionIds = [];

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

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", input.revision);
  form.set("material", input.material);
  form.set("surface_finish", input.surfaceFinish);
  form.set("document_type", input.documentType ?? "Drawing");
  form.set("change_description", "QC seed for BOM workbench tree rules");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("bom workbench tree placeholder")], input.fileName, { type: "application/octet-stream" }));
  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} created`, response.status === 201, `HTTP ${response.status}`);
  createdSubmissionIds.push(body.submissionId);
  return { submissionId: body.submissionId, ...input };
}

async function getJson(cookie, url, init = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie,
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function getDb() {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  return new Database(path.join(dataDir, "ai-pdm.sqlite"));
}

function cleanup() {
  const db = getDb();
  try {
    const submissionPlaceholders = createdSubmissionIds.map(() => "?").join(",");
    if (submissionPlaceholders) {
      const draftRows = db
        .prepare(`SELECT id FROM bom_drafts WHERE parent_submission_id IN (${submissionPlaceholders})`)
        .all(...createdSubmissionIds);
      const draftIds = draftRows.map((row) => row.id);
      const draftPlaceholders = draftIds.map(() => "?").join(",");
      if (draftPlaceholders) {
        db.prepare(`DELETE FROM bom_release_snapshots WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
        db.prepare(`DELETE FROM bom_review_requests WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
        db.prepare(`DELETE FROM bom_edit_events WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
        db.prepare(`DELETE FROM bom_lines_tree WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
        db.prepare(`DELETE FROM bom_drafts WHERE id IN (${draftPlaceholders})`).run(...draftIds);
      }
      db.prepare(`DELETE FROM bom_lines WHERE bom_header_id IN (SELECT id FROM bom_headers WHERE parent_submission_id IN (${submissionPlaceholders}))`).run(
        ...createdSubmissionIds
      );
      db.prepare(`DELETE FROM bom_headers WHERE parent_submission_id IN (${submissionPlaceholders})`).run(...createdSubmissionIds);
      db.prepare(`DELETE FROM file_references WHERE submission_id IN (${submissionPlaceholders})`).run(...createdSubmissionIds);
      db.prepare(`DELETE FROM submission_files WHERE submission_id IN (${submissionPlaceholders})`).run(...createdSubmissionIds);
    }
  } finally {
    db.close();
  }
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  const child = await createSubmission(engineerCookie, {
    drawingNumber: `BOMTREE-CHILD-${unique}`,
    partNumber: `P-BOMTREE-CHILD-${unique}`,
    partName: "BOM Tree Child",
    revision: "A",
    material: "SUS304",
    surfaceFinish: "Polished",
    fileName: `BOMTREE-CHILD-${unique}.sldprt`
  });

  const parentFileName = `BOMTREE-PARENT-${unique}.sldasm`;
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOMTREE-PARENT-${unique}`,
    partNumber: `P-BOMTREE-PARENT-${unique}`,
    partName: "BOM Tree Parent",
    revision: "A",
    material: "Assembly",
    surfaceFinish: "N/A",
    documentType: "Assembly",
    fileName: parentFileName,
    references: [
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${child.partNumber}.sldprt`,
        referencedPartNumber: child.partNumber,
        referencedDrawingNumber: child.drawingNumber,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 1,
        extractionMethod: "qc_bom_tree_rules",
        confidence: "high"
      }
    ]
  });

  const draftOne = await getJson(managerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "Tree Draft #1", setActive: true })
  });
  record("BOM-TREE-001 create first draft", draftOne.response.status === 201, `HTTP ${draftOne.response.status}`);

  const saveTree = await getJson(managerCookie, `/api/bom/drafts/${draftOne.body.draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      reason: "QC tree save",
      lines: [
        { id: "group-fasteners", nodeType: "group", groupName: "Fasteners", sequenceNo: 1 },
        {
          id: "line-child-a",
          parentLineId: "group-fasteners",
          nodeType: "item",
          partNumber: child.partNumber,
          partName: "Illicit BOM Workbench Rename",
          revision: "A",
          currentRevision: "Z",
          quantity: 2,
          sequenceNo: 1
        },
        {
          id: "line-child-b",
          parentLineId: "group-fasteners",
          nodeType: "item",
          partNumber: child.partNumber,
          revision: "A",
          quantity: 3,
          sequenceNo: 2
        },
        {
          id: "line-missing",
          nodeType: "item",
          partNumber: `P-BOMTREE-MISSING-${unique}`,
          revision: "A",
          quantity: 1,
          sequenceNo: 2
        }
      ]
    })
  });
  record("BOM-TREE-002 save tree returns 200", saveTree.response.ok, `HTTP ${saveTree.response.status}`);
  record("BOM-TREE-003 saved tree keeps group and two item rows", saveTree.body.draft?.lines?.length === 3, JSON.stringify(saveTree.body.draft?.lines ?? []));
  const group = saveTree.body.draft?.lines?.find((line) => line.id === "group-fasteners");
  const mergedChild = saveTree.body.draft?.lines?.find((line) => line.part_number === child.partNumber);
  record("BOM-TREE-004 group node has no quantity", group?.node_type === "group" && group?.quantity === null);
  record("BOM-TREE-005 same sibling child merges quantity", Number(mergedChild?.quantity) === 5, String(mergedChild?.quantity ?? ""));
  record("BOM-TREE-006 merged child remains under group", mergedChild?.parent_line_id === "group-fasteners", mergedChild?.parent_line_id ?? "");
  record("BOM-TREE-007 save tree marks manual source", saveTree.body.draft?.source === "manual" && mergedChild?.source === "manual");

  const itemDb = getDb();
  try {
    const itemMaster = itemDb.prepare("SELECT part_name, current_revision FROM items WHERE upper(part_number) = upper(?)").get(child.partNumber);
    record(
      "BOM-TREE-008 manual edit cannot change item master attributes",
      itemMaster?.part_name === child.partName && itemMaster?.current_revision !== "Z",
      JSON.stringify(itemMaster ?? {})
    );
  } finally {
    itemDb.close();
  }

  const tooDeepLines = Array.from({ length: 11 }, (_, index) => ({
    id: `deep-${index + 1}`,
    parentLineId: index === 0 ? null : `deep-${index}`,
    nodeType: "group",
    groupName: `Level ${index + 1}`,
    sequenceNo: 1
  }));
  const tooDeep = await getJson(managerCookie, `/api/bom/drafts/${draftOne.body.draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({ reason: "QC too deep", lines: tooDeepLines })
  });
  record("BOM-TREE-009 depth over ten is blocked", tooDeep.response.status === 400 && tooDeep.body.error === "BOM_MAX_DEPTH_EXCEEDED", JSON.stringify(tooDeep.body));

  const cycle = await getJson(managerCookie, `/api/bom/drafts/${draftOne.body.draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      reason: "QC cycle",
      lines: [
        { id: "cycle-a", parentLineId: "cycle-b", nodeType: "group", groupName: "A", sequenceNo: 1 },
        { id: "cycle-b", parentLineId: "cycle-a", nodeType: "group", groupName: "B", sequenceNo: 1 }
      ]
    })
  });
  record("BOM-TREE-010 circular parent relation is blocked", cycle.response.status === 400 && cycle.body.error === "BOM_CYCLE_DETECTED", JSON.stringify(cycle.body));

  const draftTwo = await getJson(managerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "Tree Draft #2", setActive: false })
  });
  record("BOM-TREE-011 create second non-active draft", draftTwo.response.status === 201 && draftTwo.body.draft?.is_active === 0, `HTTP ${draftTwo.response.status}`);

  const activateSecond = await getJson(managerCookie, `/api/bom/drafts/${draftTwo.body.draft.id}/active`, { method: "POST", body: "{}" });
  record("BOM-TREE-012 active endpoint returns 200", activateSecond.response.ok && activateSecond.body.draft?.is_active === 1, `HTTP ${activateSecond.response.status}`);
  const workbench = await getJson(managerCookie, `/api/bom/workbench?submissionId=${encodeURIComponent(parent.submissionId)}`);
  record("BOM-TREE-013 active endpoint switches active draft", workbench.body.workbench?.active_draft?.id === draftTwo.body.draft.id);
  const previousDraft = workbench.body.workbench?.drafts?.find((draft) => draft.id === draftOne.body.draft.id);
  record("BOM-TREE-014 prior active draft becomes inactive", previousDraft?.is_active === 0, String(previousDraft?.is_active ?? ""));

  const db = getDb();
  try {
    const saveEvent = db.prepare("SELECT event_type FROM bom_edit_events WHERE bom_draft_id = ? AND event_type = 'save_tree'").get(draftOne.body.draft.id);
    record("BOM-TREE-015 save writes edit event", saveEvent?.event_type === "save_tree", saveEvent?.event_type ?? "");
    const activeEvent = db.prepare("SELECT event_type FROM bom_edit_events WHERE bom_draft_id = ? AND event_type = 'set_active'").get(draftTwo.body.draft.id);
    record("BOM-TREE-016 active writes edit event", activeEvent?.event_type === "set_active", activeEvent?.event_type ?? "");
    const saveAudit = db
      .prepare("SELECT action FROM audit_logs WHERE submission_id = ? AND action = 'BomWorkbenchDraftSaved' ORDER BY created_at DESC LIMIT 1")
      .get(parent.submissionId);
    record("BOM-TREE-017 save writes audit log", saveAudit?.action === "BomWorkbenchDraftSaved", saveAudit?.action ?? "");
    const activeAudit = db
      .prepare("SELECT action FROM audit_logs WHERE submission_id = ? AND action = 'BomWorkbenchDraftActivated' ORDER BY created_at DESC LIMIT 1")
      .get(parent.submissionId);
    record("BOM-TREE-018 active writes audit log", activeAudit?.action === "BomWorkbenchDraftActivated", activeAudit?.action ?? "");
  } finally {
    db.close();
  }

  cleanup();
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length, failed: 0, results }, null, 2));
}

run().catch((error) => {
  try {
    cleanup();
  } catch (cleanupError) {
    results.push({ name: "cleanup", passed: false, detail: cleanupError.message });
  }
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed, failed, results, error: error.message }, null, 2));
  process.exit(1);
});
