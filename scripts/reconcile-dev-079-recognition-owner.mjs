import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import pg from "pg";
import { resolveRecognitionPartOwner } from "../src/lib/drawing-recognition-part-owner.ts";
import {
  candidateFingerprint,
  reviewRequestFingerprint,
  sha256Canonical
} from "./dev-079-recognition-owner-fingerprint.mjs";

const root = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : "true"];
}));
const provider = args.provider === "postgres" ? "postgres" : "sqlite";
const mode = ["inventory", "dry-run", "apply"].includes(args.mode) ? args.mode : "inventory";
const databasePath = path.resolve(root, args.database ?? "data/ai-pdm.sqlite");
const runId = `DEV079-RECON-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.resolve(root, args["output-dir"] ?? path.join("output", "qa", "dev-079-reconciliation", runId));
const invalidTerminalStates = new Set(["formalized", "cancelled"]);
const APPLY_CONFIRMATION = "APPLY_DEV079_RECONCILIATION";

function fingerprint(value) {
  return sha256Canonical(value);
}

function sqlLiteral(value) {
  return value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

function classification(candidate, resolution) {
  if (invalidTerminalStates.has(candidate.session_status)) return "terminal_manual_disposition";
  if (resolution.kind === "resolved") {
    return candidate.proposed_owner_id === resolution.ownerId ? "valid" : "repairable_exactly_one";
  }
  return resolution.kind === "ambiguous" ? "ambiguous_manual_disposition" : "unresolved_manual_disposition";
}

function buildPlan(candidates, targets) {
  const targetsBySession = new Map();
  for (const target of targets) targetsBySession.set(target.session_id, [...(targetsBySession.get(target.session_id) ?? []), {
    id: target.id,
    partNumber: target.part_number,
    recordStatus: target.record_status,
    source: target.owner_source
  }]);
  const inventory = [];
  const plan = [];
  for (const candidate of candidates) {
    const sessionTargets = targetsBySession.get(candidate.session_id) ?? [];
    const currentResolution = resolveRecognitionPartOwner({
      targets: sessionTargets,
      suppliedOwnerId: candidate.proposed_owner_id,
      anchorPartNumber: candidate.field_key === "part_number" ? candidate.proposed_value : null,
      allowUnanchored: true
    });
    const desiredResolution = currentResolution.kind === "resolved" ? currentResolution : resolveRecognitionPartOwner({
      targets: sessionTargets,
      anchorPartNumber: candidate.field_key === "part_number" ? candidate.proposed_value : null,
      allowUnanchored: true
    });
    const disposition = classification(candidate, desiredResolution);
    inventory.push({
      candidateId: candidate.id,
      companyId: candidate.company_id,
      drawingNumber: candidate.drawing_number,
      sessionId: candidate.session_id,
      sessionStatus: candidate.session_status,
      fieldKey: candidate.field_key,
      reviewState: candidate.review_state,
      currentOwnerId: candidate.proposed_owner_id,
      resolution: desiredResolution,
      disposition
    });
    if (disposition !== "repairable_exactly_one" || desiredResolution.kind !== "resolved") continue;
    const sibling = candidates.find((row) => row.id !== candidate.id
      && row.session_id === candidate.session_id
      && row.category === candidate.category
      && row.field_key === candidate.field_key
      && row.normalized_value === candidate.normalized_value
      && row.applicability_scope === candidate.applicability_scope
      && row.proposed_owner_id === desiredResolution.ownerId);
    const after = {
      proposed_owner_id: desiredResolution.ownerId,
      current_formal_value: sibling?.current_formal_value ?? candidate.current_formal_value,
      current_formal_fingerprint: sibling?.current_formal_fingerprint ?? candidate.current_formal_fingerprint,
      variant_status: sibling?.variant_status ?? candidate.variant_status,
      review_state: ["accepted", "corrected", "mapped"].includes(candidate.review_state)
        ? candidate.review_state
        : sibling?.review_state ?? (candidate.review_state === "blocked" ? "proposed" : candidate.review_state),
      group_key: fingerprint({
        category: candidate.category,
        fieldKey: candidate.field_key,
        normalizedValue: candidate.normalized_value,
        applicabilityScope: candidate.applicability_scope,
        ownerType: "part_number",
        ownerId: desiredResolution.ownerId
      }),
      row_version: Number(candidate.row_version) + 1
    };
    plan.push({
      candidateId: candidate.id,
      sessionId: candidate.session_id,
      drawingNumber: candidate.drawing_number,
      resolution: desiredResolution,
      before: {
        proposed_owner_id: candidate.proposed_owner_id,
        current_formal_value: candidate.current_formal_value,
        current_formal_fingerprint: candidate.current_formal_fingerprint,
        variant_status: candidate.variant_status,
        review_state: candidate.review_state,
        group_key: candidate.group_key,
        row_version: Number(candidate.row_version)
      },
      after
    });
  }
  return { inventory, plan: plan.sort((a, b) => a.candidateId.localeCompare(b.candidateId)) };
}

async function openProvider() {
  if (provider === "sqlite") {
    if (mode === "apply" && !Object.hasOwn(args, "database")) throw new Error("APPLY_REQUIRES_EXPLICIT_DATABASE_TARGET");
    const database = new Database(databasePath, { readonly: mode !== "apply", fileMustExist: true });
    database.pragma("foreign_keys = ON");
    return {
      description: { provider, target: databasePath },
      async query(sql, params = {}) { return database.prepare(sql).all(params); },
      async get(sql, params = {}) { return database.prepare(sql).get(params) ?? null; },
      async execute(sql, params = {}) { return database.prepare(sql).run(params).changes; },
      async transaction(fn) {
        database.exec("BEGIN IMMEDIATE");
        try {
          const value = await fn();
          database.exec("COMMIT");
          return value;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      },
      async constraintEvidence() { return database.pragma("foreign_key_check"); },
      async close() { database.close(); }
    };
  }
  const envName = args["connection-string-env"];
  if (!envName || !process.env[envName]) throw new Error("POSTGRES_REQUIRES_CONNECTION_STRING_ENV");
  const client = new pg.Client({ connectionString: process.env[envName], application_name: "ai-pdm-dev079-reconciliation" });
  await client.connect();
  const named = (sql, params) => {
    const values = [];
    const text = sql.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, key) => {
      let index = Object.keys(params).indexOf(key);
      if (index === -1) throw new Error(`MISSING_SQL_PARAM:${key}`);
      values.push(params[key]);
      return `$${values.length}`;
    });
    return { text, values };
  };
  return {
    description: { provider, target: `env:${envName}` },
    async query(sql, params = {}) { const bound = named(sql, params); return (await client.query(bound.text, bound.values)).rows; },
    async get(sql, params = {}) { return (await this.query(sql, params))[0] ?? null; },
    async execute(sql, params = {}) { const bound = named(sql, params); return (await client.query(bound.text, bound.values)).rowCount ?? 0; },
    async transaction(fn) { await client.query("BEGIN"); try { const value = await fn(); await client.query("COMMIT"); return value; } catch (error) { await client.query("ROLLBACK"); throw error; } },
    async constraintEvidence() { return [{ provider_constraints: "enforced" }]; },
    async close() { await client.end(); }
  };
}

async function readState(store) {
  const candidates = await store.query(`
    SELECT candidate.*, session.status AS session_status, drawing.drawing_number
    FROM drawing_recognition_candidates candidate
    JOIN drawing_recognition_sessions session ON session.id = candidate.session_id AND session.company_id = candidate.company_id
    LEFT JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
    WHERE candidate.proposed_owner_type = 'part_number'
      AND TRIM(COALESCE(candidate.proposed_value, '')) <> ''
    ORDER BY candidate.id`);
  const targets = await store.query(`
    SELECT session.id AS session_id, part.id, part.part_number, part.record_status, 'formal' AS owner_source
    FROM drawing_recognition_sessions session
    JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
    JOIN drawing_part_links link ON link.drawing_number_id = drawing.formal_drawing_number_id
    JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = session.company_id
    UNION ALL
    SELECT session.id AS session_id, draft.id, reservation.candidate_code AS part_number, 'Draft' AS record_status, 'draft' AS owner_source
    FROM drawing_recognition_sessions session
    JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
    JOIN numbering_draft_parts draft ON draft.workspace_id = drawing.workspace_id AND draft.company_id = session.company_id
    JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
      AND reservation.company_id = session.company_id AND reservation.reservation_state = 'active'
    ORDER BY 1, 3, 2`);
  const requests = await store.query("SELECT id, snapshot_hash, snapshot_payload FROM pdm_work_review_requests ORDER BY id");
  return { candidates, targets, requests };
}

function summary(inventory) {
  return inventory.reduce((result, item) => ({ ...result, [item.disposition]: (result[item.disposition] ?? 0) + 1 }), {});
}

fs.mkdirSync(outputDir, { recursive: true });
const store = await openProvider();
let manifest;
try {
  const before = await readState(store);
  const targetFingerprintBefore = candidateFingerprint(before.candidates);
  const reviewRequestFingerprintBefore = reviewRequestFingerprint(before.requests);
  const { inventory, plan } = buildPlan(before.candidates, before.targets);
  const planHash = fingerprint(plan.map(({ candidateId, before: beforeRow, after, resolution }) => ({ candidateId, before: beforeRow, after, resolution })));
  const base = {
    schemaVersion: "dev079-recognition-owner-reconciliation-v1",
    runId,
    mode,
    target: store.description,
    generatedAt: new Date().toISOString(),
    targetFingerprintBefore,
    reviewRequestFingerprintBefore,
    planHash,
    inventorySummary: summary(inventory),
    inventory,
    plan
  };

  if (mode !== "apply") {
    manifest = { ...base, status: "READ_ONLY_COMPLETE", appliedCount: 0, targetFingerprintAfter: targetFingerprintBefore, reviewRequestFingerprintAfter: reviewRequestFingerprintBefore };
  } else {
    if (args.confirm !== APPLY_CONFIRMATION) throw new Error("APPLY_CONFIRMATION_REQUIRED");
    if (!args["idempotency-key"]?.trim()) throw new Error("APPLY_IDEMPOTENCY_KEY_REQUIRED");
    if (!args["expected-fingerprint"]?.trim()) throw new Error("APPLY_EXPECTED_TARGET_FINGERPRINT_REQUIRED");
    if (!args["expected-review-fingerprint"]?.trim()) throw new Error("APPLY_EXPECTED_REVIEW_FINGERPRINT_REQUIRED");
    if (!args["expected-plan-hash"]?.trim()) throw new Error("APPLY_EXPECTED_PLAN_HASH_REQUIRED");
    const triggerName = provider === "sqlite" ? "trg_drawing_recognition_part_owner_update" : "trg_drawing_recognition_part_owner";
    const trigger = provider === "sqlite"
      ? await store.get("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = :name", { name: triggerName })
      : await store.get("SELECT tgname AS name FROM pg_trigger WHERE tgname = :name AND NOT tgisinternal", { name: triggerName });
    const auditTable = provider === "sqlite"
      ? await store.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drawing_recognition_owner_reconciliations'")
      : await store.get("SELECT to_regclass('public.drawing_recognition_owner_reconciliations') AS name");
    if (!trigger || !auditTable?.name) throw new Error("APPLY_SCHEMA_INVARIANT_NOT_INSTALLED");
    const existing = await store.get("SELECT manifest_json FROM drawing_recognition_owner_reconciliations WHERE idempotency_key = :idempotencyKey", { idempotencyKey: args["idempotency-key"] });
    if (existing) {
      const stored = typeof existing.manifest_json === "string" ? JSON.parse(existing.manifest_json) : existing.manifest_json;
      if (stored.targetFingerprintBefore !== args["expected-fingerprint"]) throw new Error("IDEMPOTENT_REPLAY_EXPECTED_TARGET_FINGERPRINT_MISMATCH");
      if (stored.reviewRequestFingerprintBefore !== args["expected-review-fingerprint"]) throw new Error("IDEMPOTENT_REPLAY_EXPECTED_REVIEW_FINGERPRINT_MISMATCH");
      if (stored.planHash !== args["expected-plan-hash"]) throw new Error("IDEMPOTENT_REPLAY_EXPECTED_PLAN_HASH_MISMATCH");
      if (stored.targetFingerprintAfter !== targetFingerprintBefore) throw new Error("IDEMPOTENT_REPLAY_TARGET_DRIFT");
      if (stored.reviewRequestFingerprintAfter !== reviewRequestFingerprintBefore) throw new Error("IDEMPOTENT_REPLAY_REVIEW_REQUEST_DRIFT");
      manifest = { ...stored, rerunAt: new Date().toISOString(), idempotentReplay: true, appliedCount: 0 };
    } else {
      if (args["expected-fingerprint"] !== targetFingerprintBefore) throw new Error("APPLY_TARGET_FINGERPRINT_MISMATCH");
      if (args["expected-review-fingerprint"] !== reviewRequestFingerprintBefore) throw new Error("APPLY_REVIEW_FINGERPRINT_MISMATCH");
      if (args["expected-plan-hash"] !== planHash) throw new Error("APPLY_PLAN_HASH_MISMATCH");
      manifest = await store.transaction(async () => {
        for (const item of plan) {
          const changed = await store.execute(`UPDATE drawing_recognition_candidates
            SET proposed_owner_id = :ownerId,
                current_formal_value = :currentFormalValue,
                current_formal_fingerprint = :currentFormalFingerprint,
                variant_status = :variantStatus,
                review_state = :reviewState,
                group_key = :groupKey,
                row_version = :rowVersion,
                updated_at = :updatedAt
            WHERE id = :candidateId AND row_version = :expectedRowVersion`, {
            ownerId: item.after.proposed_owner_id,
            currentFormalValue: item.after.current_formal_value,
            currentFormalFingerprint: item.after.current_formal_fingerprint,
            variantStatus: item.after.variant_status,
            reviewState: item.after.review_state,
            groupKey: item.after.group_key,
            rowVersion: item.after.row_version,
            updatedAt: new Date().toISOString(),
            candidateId: item.candidateId,
            expectedRowVersion: item.before.row_version
          });
          if (changed !== 1) throw new Error(`RECONCILIATION_STALE_CANDIDATE:${item.candidateId}`);
        }
        const after = await readState(store);
        const targetFingerprintAfter = candidateFingerprint(after.candidates);
        const reviewRequestFingerprintAfter = reviewRequestFingerprint(after.requests);
        if (reviewRequestFingerprintAfter !== reviewRequestFingerprintBefore) throw new Error("REVIEW_REQUEST_SNAPSHOT_MUTATED");
        const constraintEvidence = await store.constraintEvidence();
        if (provider === "sqlite" && constraintEvidence.length > 0) throw new Error("FOREIGN_KEY_CHECK_FAILED");
        const appliedManifest = {
          ...base,
          status: "APPLIED",
          idempotencyKey: args["idempotency-key"],
          appliedCount: plan.length,
          targetFingerprintAfter,
          reviewRequestFingerprintAfter,
          constraintEvidence
        };
        await store.execute(`INSERT INTO drawing_recognition_owner_reconciliations (
          id, idempotency_key, provider_kind, plan_hash, target_fingerprint_before, target_fingerprint_after,
          request_fingerprint_before, request_fingerprint_after, manifest_json, created_at
        ) VALUES (
          :id, :idempotencyKey, :providerKind, :planHash, :targetFingerprintBefore, :targetFingerprintAfter,
          :requestFingerprintBefore, :requestFingerprintAfter, :manifestJson, :createdAt
        )`, {
          id: `recognition-owner-reconciliation-${crypto.randomUUID()}`,
          idempotencyKey: args["idempotency-key"],
          providerKind: provider,
          planHash,
          targetFingerprintBefore,
          targetFingerprintAfter,
          requestFingerprintBefore: reviewRequestFingerprintBefore,
          requestFingerprintAfter: reviewRequestFingerprintAfter,
          manifestJson: JSON.stringify(appliedManifest),
          createdAt: new Date().toISOString()
        });
        return appliedManifest;
      });
    }
  }
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const rollback = (manifest.plan ?? []).map((item) => `UPDATE drawing_recognition_candidates SET proposed_owner_id = ${sqlLiteral(item.before.proposed_owner_id)}, current_formal_value = ${sqlLiteral(item.before.current_formal_value)}, current_formal_fingerprint = ${sqlLiteral(item.before.current_formal_fingerprint)}, variant_status = ${sqlLiteral(item.before.variant_status)}, review_state = ${sqlLiteral(item.before.review_state)}, group_key = ${sqlLiteral(item.before.group_key)}, row_version = ${Number(item.before.row_version)} WHERE id = ${sqlLiteral(item.candidateId)};`).join("\n");
  fs.writeFileSync(path.join(outputDir, "rollback.sql"), `${rollback}\n`, "utf8");
  console.log(JSON.stringify({ status: manifest.status, mode, provider, outputDir, inventorySummary: manifest.inventorySummary, planCount: manifest.plan?.length ?? 0, appliedCount: manifest.appliedCount, targetFingerprintBefore: manifest.targetFingerprintBefore, targetFingerprintAfter: manifest.targetFingerprintAfter }, null, 2));
} finally {
  await store.close();
}
