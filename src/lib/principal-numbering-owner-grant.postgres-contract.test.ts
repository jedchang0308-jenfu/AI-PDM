import path from "node:path";
import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
vi.mock("@/lib/jenfu-principal-request-guard", async original => ({
  ...await original<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: async (input: { database: AsyncDatabaseClient },
    run: (client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<unknown>,
    options: { readOnly?: boolean; isolationLevel?: "repeatable_read" | "serializable" } = {}) =>
    input.database.transaction(client => run(client, {
      profile: { pdmUserId:"qc-profile-legacy",companyId:"company-jenfu" },
      session: { contractVersion:"jenfu.ai-pdm-session.v2",appId:"ai-pdm",sessionId:"numbering-qc",
        identityIssuer:"issuer-legacy",identitySubject:"subject-legacy",principalId:"principal-legacy",
        employeeId:"employee-legacy",authEpoch:1,profileVersion:1,assuranceLevel:"aal2",
        issuedAt:"2026-09-30T00:00:00Z",expiresAt:"2026-09-30T01:00:00Z" }
    }), { readOnly:options.readOnly !== false, isolationLevel:options.isolationLevel ?? "repeatable_read" })
}));
import { POST as createRecord } from "@/app/api/numbering/records/route";
import { GET as rootDetail } from "@/app/api/numbering/roots/[rootCode]/route";
import { GET as search } from "@/app/api/numbering/search/route";
import { isProductionSliceAllowedApiMutation } from "@/lib/production-slice";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { POST as appendPart } from "@/app/api/numbering/roots/[rootCode]/parts/route";
import { POST as appendDrawing } from "@/app/api/numbering/roots/[rootCode]/drawings/route";
import { POST as appendBoth } from "@/app/api/numbering/roots/[rootCode]/drawing-part/route";
const dsn = process.env.DEV121_NUMBERING_POSTGRES_URL;
const phase = process.env.DEV057_CONTRACT_PHASE;
const enabled = Boolean(dsn && ["assigned","revoked","out-of-scope","restored"].includes(phase ?? ""));
const allowed = ["assigned","restored"].includes(phase ?? "");
const db = enabled ? getAsyncDatabaseClient() : null;
const token = Buffer.from(JSON.stringify({ type:"JENFU-AI-PDM-PRINCIPAL",version:2 })).toString("base64url") + ".payload.signature";
const request = (url: string, method = "GET", body?: object) => new Request("https://ai-pdm.test"+url, {
  method, headers:{ cookie:"pdm_session="+token,"content-type":"application/json","idempotency-key":"dev057-numbering-one" },
  body:body ? JSON.stringify(body) : undefined
});
const create = () => createRecord(request("/api/numbering/records","POST", {
  coreName:"DEV057 Principal numbered standard part",itemKind:"purchased",structureType:"single_part",drawingRequested:false
}));
let created: { root: { id:string;rootCode:string };partNumber:{ id:string;partNumber:string } } | null = null;
beforeAll(async () => {
  if (!enabled || !dsn) return;
  expect(new URL(dsn).hostname).toBe("127.0.0.1");
  expect(new URL(dsn).pathname).toMatch(/^\/dev121_numbering_[a-f0-9]{16}$/u);
  const taskRoot = process.env.DEV057_FILE_QC_ROOT;
  if (!taskRoot || !process.env.PDM_DATA_DIR || !process.env.PDM_REPOSITORY_DIR) throw new Error("TASK_OWNED_NUMBERING_REQUIRED");
  expect(path.resolve(process.env.PDM_DATA_DIR)).toBe(path.join(taskRoot,"aipdm-numbering-data"));
  expect(path.resolve(process.env.PDM_REPOSITORY_DIR)).toBe(path.join(taskRoot,"aipdm-numbering-repository"));
  await fs.access(path.join(taskRoot,"cluster","PG_VERSION"));
});
afterAll(async () => { await db?.close(); });
describe.runIf(enabled)("real OrgMaster grant -> Principal numbering HTTP -> native PostgreSQL tables", () => {
  it("creates, audits and replays a numbered standard part atomically", async () => {
    if (!db) throw new Error("TASK_OWNED_POSTGRES_REQUIRED");
    expect(isProductionSliceAllowedApiMutation("POST","/api/numbering/records")).toBe(true);
    const response = await create();
    expect(response.status, await response.clone().text()).toBe(allowed ? 201 : 403);
    if (!allowed) {
      expect((await db.queryOne<{ count:number }>("SELECT count(*)::integer AS count FROM platform_command_receipts"))?.count).toBe(0);
      expect((await db.queryOne<{ count:number }>("SELECT count(*)::integer AS count FROM part_roots"))?.count).toBe(0);
      return;
    }
    created = await response.json();
    expect(created?.root.rootCode).toBeTruthy();
    const audit = await db.queryOne<{ actor_id:string;company_id:string;detail_json:string|object }>(
      "SELECT actor_id,company_id,detail_json FROM audit_logs WHERE action='numbering.create'");
    expect(audit?.actor_id).toBe("qc-profile-legacy");
    expect(audit?.company_id).toBe("company-jenfu");
    const detail = typeof audit?.detail_json === "string" ? JSON.parse(audit.detail_json) : audit?.detail_json;
    expect(detail).toMatchObject({ securityActor: { principalId:"principal-legacy",profileVersion:1,actorKind:"human" } });
    const replay = await create();
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(created);
    for (const table of ["platform_command_receipts","platform_outbox_events"]) {
      const rows = await db.query<{ actor_id:string;principal_id:string;company_id:string }>("SELECT actor_id,principal_id,company_id FROM " + table);
      expect(rows).toEqual([expect.objectContaining({ actor_id:"qc-profile-legacy",principal_id:"principal-legacy",company_id:"company-jenfu" })]);
    }
    expect((await db.queryOne<{ count:number }>("SELECT count(*)::integer AS count FROM audit_logs WHERE action='numbering.create'"))?.count).toBe(1);
  });
  it("reloads the created root and finds its number through the actual search route", async () => {
    const id = created?.root.rootCode ?? "missing-root";
    const detail = await rootDetail(request("/api/numbering/roots/"+id),{params:Promise.resolve({rootCode:id})});
    expect(detail.status).toBe(allowed ? 200 : 403);
    const found = await search(request("/api/numbering/search?query="+encodeURIComponent(id)));
    expect(found.status).toBe(allowed ? 200 : 403);
    if (allowed) {
      expect(await detail.text()).toContain(created!.partNumber.partNumber);
      expect(await found.text()).toContain(created!.partNumber.partNumber);
    }
  });
  it.each([
    { path:"parts",handler:appendPart,action:"numbering.part_number.create",
      body:{itemKind:"purchased",structureType:"single_part",reason:"new standard variant",linkRelationType:"none"} },
    { path:"drawings",handler:appendDrawing,action:"numbering.drawing_number.create",
      body:{purposeCode:"R",purposeDescription:"reference diagram",reason:"reference drawing",linkRelationType:"none"} },
    { path:"drawing-part",handler:appendBoth,action:"numbering.drawing_part.create",
      body:{purposeCode:"R",purposeDescription:"variant diagram",itemKind:"purchased",structureType:"single_part",
        reason:"linked variant",linkRelationType:"reference"} }
  ])("appends $path through the actual Principal command and preserves audit on replay", async entry => {
    if (!db) throw new Error("TASK_OWNED_POSTGRES_REQUIRED");
    const rootCode=created?.root.rootCode ?? "missing-root";
    const url="/api/numbering/roots/"+rootCode+"/"+entry.path;
    expect(isProductionSliceAllowedApiMutation("POST",url)).toBe(true);
    const before=await db.queryOne("SELECT (SELECT count(*) FROM part_numbers) AS parts,(SELECT count(*) FROM drawing_numbers) AS drawings,(SELECT count(*) FROM platform_command_receipts) AS receipts,(SELECT count(*) FROM platform_outbox_events) AS outbox,(SELECT count(*) FROM audit_logs) AS audit");
    const response=await entry.handler(request(url,"POST",entry.body),{params:Promise.resolve({rootCode})});
    expect(response.status,await response.clone().text()).toBe(allowed ? 201 : 403);
    if (!allowed) {
      expect(await db.queryOne("SELECT (SELECT count(*) FROM part_numbers) AS parts,(SELECT count(*) FROM drawing_numbers) AS drawings,(SELECT count(*) FROM platform_command_receipts) AS receipts,(SELECT count(*) FROM platform_outbox_events) AS outbox,(SELECT count(*) FROM audit_logs) AS audit")).toEqual(before);
      return;
    }
    const first=await response.json();
    const replay=await entry.handler(request(url,"POST",entry.body),{params:Promise.resolve({rootCode})});
    expect(replay.status,await replay.clone().text()).toBe(200);
    expect(await replay.json()).toMatchObject({root:first.root,reusedFromIdempotency:true});
    const rows=await db.query<{actor_id:string;company_id:string;scope_kind:string;detail_json:string|object}>(
      "SELECT actor_id,company_id,scope_kind,detail_json FROM audit_logs WHERE action=:action",{action:entry.action});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({actor_id:"qc-profile-legacy",company_id:"company-jenfu",scope_kind:"tenant"});
    const detail=typeof rows[0].detail_json === "string" ? JSON.parse(rows[0].detail_json) : rows[0].detail_json;
    expect(detail).toMatchObject({securityActor:{principalId:"principal-legacy",profileVersion:1,actorKind:"human",reason:entry.action}});
    const reload=await rootDetail(request("/api/numbering/roots/"+rootCode),{params:Promise.resolve({rootCode})});
    expect(reload.status).toBe(200);
    const text=await reload.text();
    if(first.partNumber) expect(text).toContain(first.partNumber.partNumber);
    if(first.drawingNumber) expect(text).toContain(first.drawingNumber.drawingNumber);
  });
  it("rolls back numbering writes when the trusted Principal audit context is absent", async () => {
    if (!db) throw new Error("TASK_OWNED_POSTGRES_REQUIRED");
    const before = await db.queryOne("SELECT (SELECT count(*) FROM part_roots) AS roots,(SELECT count(*) FROM part_numbers) AS parts,(SELECT count(*) FROM audit_logs) AS audit");
    await expect(new AsyncNumberingRepository(db).createNumberingRecord({
      companyId:"company-jenfu",createdBy:"qc-profile-legacy",coreName:"unbound audit must roll back",
      itemKind:"purchased",structureType:"single_part"
    })).rejects.toThrow("NUMBERING_PRINCIPAL_AUDIT_REQUIRED");
    expect(await db.queryOne("SELECT (SELECT count(*) FROM part_roots) AS roots,(SELECT count(*) FROM part_numbers) AS parts,(SELECT count(*) FROM audit_logs) AS audit")).toEqual(before);
  });
  it("rejects a profile actor that disagrees with the verified command actor", async () => {
    if (!db) throw new Error("TASK_OWNED_POSTGRES_REQUIRED");
    const before = await db.queryOne("SELECT (SELECT count(*) FROM part_roots) AS roots,(SELECT count(*) FROM audit_logs) AS audit");
    const verified = { profile:{pdmUserId:"different-profile",companyId:"company-jenfu"},
      session:{principalId:"principal-legacy",profileVersion:1} } as VerifiedPrincipalRequest;
    await expect(new AsyncNumberingRepository(db,undefined,undefined,undefined,verified).createNumberingRecord({
      companyId:"company-jenfu",createdBy:"qc-profile-legacy",coreName:"mixed actor must roll back",
      itemKind:"purchased",structureType:"single_part"
    })).rejects.toThrow("NUMBERING_PRINCIPAL_AUDIT_REQUIRED");
    expect(await db.queryOne("SELECT (SELECT count(*) FROM part_roots) AS roots,(SELECT count(*) FROM audit_logs) AS audit")).toEqual(before);
  });
  it("refuses another company without creating any receipt, outbox or audit", async () => {
    if (!db) throw new Error("TASK_OWNED_POSTGRES_REQUIRED");
    const before = await db.queryOne("SELECT (SELECT count(*) FROM platform_command_receipts) AS receipts,(SELECT count(*) FROM platform_outbox_events) AS outbox,(SELECT count(*) FROM audit_logs) AS audit");
    const response = await createRecord(request("/api/numbering/records?company_code=MAXIMA","POST",{coreName:"wrong company",itemKind:"purchased",drawingRequested:false}));
    expect(response.status).toBe(403);
    expect(await db.queryOne("SELECT (SELECT count(*) FROM platform_command_receipts) AS receipts,(SELECT count(*) FROM platform_outbox_events) AS outbox,(SELECT count(*) FROM audit_logs) AS audit")).toEqual(before);
  });
});
