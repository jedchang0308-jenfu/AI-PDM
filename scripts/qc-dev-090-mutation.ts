import { getAsyncDatabaseClient, closeAsyncDatabaseClient } from "@/lib/db-async-provider";
import { RelationFormalAuthorityRepository } from "@/lib/repositories/relation-formal-authority-async-repository";

const companyId = process.env.PDM_DEFAULT_COMPANY_ID?.trim() || "company-jenfu";
const client = getAsyncDatabaseClient();
try {
  const actor = process.env.PDM_QC_ACTOR_ID?.trim()
    ? { id: process.env.PDM_QC_ACTOR_ID.trim() }
    : await client.queryOne<{ id: string }>("SELECT id FROM users ORDER BY id LIMIT 1");
  if (!actor) throw new Error("DEV090_NO_ACTOR_FIXTURE");
  const actorId = actor.id;
  const root = await client.queryOne<{ id: string }>("SELECT id FROM part_roots WHERE company_id = :companyId ORDER BY root_code LIMIT 1", { companyId });
  if (!root) throw new Error("DEV090_NO_ROOT_FIXTURE");
  const authority = new RelationFormalAuthorityRepository(client);
  const before = await authority.getMatrix({ companyId, rootId: root.id });
  const drawing = before.drawings[0];
  const part = before.parts[0];
  if (!drawing || !part) throw new Error("DEV090_NO_MATRIX_AXES");
  const existing = before.cells.find((cell) => cell.drawingNumberId === drawing.id && cell.partNumberId === part.id)?.relationType ?? null;
  const alternate = existing === "manufacturing_basis" ? "reference" : "manufacturing_basis";
  const changed = await authority.applyMatrix({
    companyId,
    rootId: root.id,
    actorId,
    changes: [{ drawingNumberId: drawing.id, partNumberId: part.id, relationType: alternate }],
    ifMatch: before.matrixEtag,
    idempotencyKey: `dev-090-qc-${Date.now()}-forward`
  });
  const restored = await authority.applyMatrix({
    companyId,
    rootId: root.id,
    actorId,
    changes: [{ drawingNumberId: drawing.id, partNumberId: part.id, relationType: existing }],
    ifMatch: changed.matrixEtag,
    idempotencyKey: `dev-090-qc-${Date.now()}-restore`
  });
  if (restored.matrixEtag !== before.matrixEtag) throw new Error("DEV090_MUTATION_RESTORE_MISMATCH");
  const receiptBeforeNoop = await client.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM platform_command_receipts WHERE company_id = :companyId AND command_name = 'pdm.relation_matrix.update.v1'", { companyId });
  const noop = await authority.applyMatrix({
    companyId,
    rootId: root.id,
    actorId,
    changes: [{ drawingNumberId: drawing.id, partNumberId: part.id, relationType: existing }],
    ifMatch: restored.matrixEtag,
    idempotencyKey: `dev-090-qc-${Date.now()}-noop`
  });
  const receiptAfterNoop = await client.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM platform_command_receipts WHERE company_id = :companyId AND command_name = 'pdm.relation_matrix.update.v1'", { companyId });
  if (noop.changedCount !== 0 || Number(receiptAfterNoop?.count) !== Number(receiptBeforeNoop?.count)) throw new Error("DEV090_NOOP_RECEIPT_CHANGED");
  console.log(JSON.stringify({ status: "PASS", rootId: root.id, changedCount: changed.changedCount, restored: true, noopReceiptStable: true, matrixEtag: restored.matrixEtag }));
} finally {
  await closeAsyncDatabaseClient();
}
