import crypto from "node:crypto";
import { Readable } from "node:stream";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { withVerifiedJenfuPrincipalRequest, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { principalRequestInput } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot, evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { authorizeDynamicResourceCapabilityInSnapshot } from "@/lib/principal-resource-capability";
import { hasPdmNonOwnerEditScope } from "@/lib/pdm-edit-scope-policy";
import { DrawingRevisionWorkAsyncRepository, type DrawingWorkRow } from "@/lib/repositories/drawing-revision-work-async-repository";
import { principalJobInitiatorFromVerifiedRequest, parsePrincipalJobInitiator, requireCurrentPrincipalJobAuthority } from "@/lib/principal-job-authority";
import { createAssemblyStorageService, type AssemblyUploadSession, type AssemblyStoredObject } from "@/lib/assembly-storage";
import { validateAssemblyArchive, extractAssemblyArchiveEntry, AssemblyArchiveError, type AssemblyArchiveManifest } from "@/lib/assembly-archive";
import { createFileStorageService, buildStorageKey } from "@/lib/file-storage";
import { getStorageUploadPolicy } from "@/lib/storage-upload-policy";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { runPrincipalDev087Command } from "@/lib/pdm-principal-dev087-command";
import { assemblyBomProjection, normalizeAssemblyQuantity, type AssemblyAnalysisResult, type AssemblyBomRow } from "@/lib/drawing-assembly-bom";
import { deriveAssemblySelectionFromCache } from "@/lib/drawing-assembly-cache";

export const ASSEMBLY_PACKAGE_LIMITS = { chunkBytes: 8 * 1024 * 1024, maxArchiveBytes: 256 * 1024 * 1024 };
export const assemblyJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value === "string") { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return value && typeof value === "object" ? value as T : fallback;
};
const digest = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assemblyError(message: string, status = 409): never {
  throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", message, ([400,403,404,409,410,413,422,500,503].includes(status)?status:503) as 409);
}
export type AssemblyPackageRow = {
  id: string; company_id: string; work_id: string; revision_id: string; initiator_principal_id: string;
  initiator_authority_json: string; created_by: string; idempotency_key: string; request_hash: string;
  file_name: string; byte_size: number | string; status: string; storage_session_json: string | null;
  storage_object_json: string | null; archive_sha256: string | null; manifest_json: string | null;
  main_entry_key: string | null; configurations_json: string; selection_version: number;
  primary_binding_id: string | null; primary_asset_id: string | null; primary_conflict: number;primary_conflict_binding_id:string|null;
  upload_lease_token: string | null; upload_lease_expires_at: string | Date | null; next_offset: number | string;
  active_at: string | Date | null; superseded_at: string | Date | null; diagnostic: string | null;
};
export type AssemblyAnalysisRow = { id: string; status: string; raw_result_json:string|null; result_json: string | null; result_digest: string | null;
  overrides_json: string; draft_version: number; parser_version: string | null };
export async function readAssemblyPackage(client: AsyncDatabaseClient, companyId: string, packageId: string, options: {lock?: boolean} = {}) {
  return client.queryOne<AssemblyPackageRow>(`SELECT * FROM drawing_assembly_packages WHERE company_id=:companyId AND id=:packageId${options.lock && client.kind === "postgres" ? " FOR UPDATE" : ""}`, { companyId, packageId });
}
export async function readAssemblyAnalysis(client: AsyncDatabaseClient, pkg: AssemblyPackageRow) {
  return client.queryOne<AssemblyAnalysisRow>(`SELECT * FROM drawing_assembly_analysis WHERE company_id=:companyId AND package_id=:packageId AND selection_version=:selectionVersion`,
    { companyId: pkg.company_id, packageId: pkg.id, selectionVersion: Number(pkg.selection_version) });
}
export async function queueAssemblyAnalysis(client: AsyncDatabaseClient, pkg: AssemblyPackageRow) {
  await client.execute(`INSERT INTO drawing_assembly_analysis(id,company_id,package_id,selection_version,initiator_principal_id,status)
    VALUES(:id,:companyId,:packageId,:selectionVersion,:principalId,'queued') ON CONFLICT(company_id,package_id,selection_version) DO NOTHING`,
  { id: crypto.randomUUID(), companyId: pkg.company_id, packageId: pkg.id, selectionVersion: Number(pkg.selection_version), principalId: pkg.initiator_principal_id });
}
export async function requireAssemblyPackageJobAuthority(client: AsyncDatabaseClient, pkg: AssemblyPackageRow) {
  const initiator = parsePrincipalJobInitiator(pkg.initiator_authority_json);
  if (!initiator || initiator.principalId !== pkg.initiator_principal_id || initiator.companyId !== pkg.company_id || initiator.pdmUserId !== pkg.created_by) assemblyError("組立包發起者資料無效", 403);
  await requireCurrentPrincipalJobAuthority(client, initiator, { linkedEntityType: "drawing_revision", documentCategory: "cad_3d", action: "view_and_download" });
  const [editDecision] = await evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot(client, {
    principalId: initiator.principalId, employeeId: initiator.employeeId, identityIssuer: initiator.identityIssuer,
    identitySubject: initiator.identitySubject, localPrincipalId: initiator.pdmUserId, companyId: initiator.companyId, sessionSchemaVersion: 2
  }, [{permissionKind:"action",permissionCode:"numbering.workspace.update",resourceGroup:"drawing"}]);
  if (!editDecision?.allowed) assemblyError("組立包發起者已無編輯權限", 403);
  const work = await new DrawingRevisionWorkAsyncRepository(client).readWork(client, pkg.company_id, pkg.work_id);
  if (!work || work.handling !== "owner" || work.revision_id !== pkg.revision_id || !pkg.active_at || pkg.superseded_at || pkg.status !== "accepted") assemblyError("組立包來源已失效");
  if (work.owner_user_id !== initiator.pdmUserId && !hasPdmNonOwnerEditScope({roles:editDecision.roleCode ? [editDecision.roleCode] : []})) assemblyError("組立包發起者已無工作編輯資格",403);
  await new DrawingRevisionWorkAsyncRepository(client).assertWorkMutationBasis(client, work);
  return initiator;
}
async function authorize(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, workId: string, write: boolean, bytes = false) {
  const code = write ? "numbering.workspace.update" : "numbering.workspace.view";
  const [decision] = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, verified, [{ permissionKind: "action", permissionCode: code, resourceGroup: "drawing" }]);
  if (!decision?.allowed) assemblyError("無權限執行此操作", 403);
  const repository = new DrawingRevisionWorkAsyncRepository(client);
  const work = await repository.readWork(client, verified.profile.companyId, workId, write);
  if (!work) assemblyError("圖面工作不存在", 404);
  if (work.owner_user_id !== verified.profile.pdmUserId && !hasPdmNonOwnerEditScope({ roles: decision.roleCode ? [decision.roleCode] : [] })) assemblyError("無權限執行此操作", 403);
  if (write) {
    if (work.handling !== "owner") assemblyError("此工作目前無法修改");
    await repository.assertWorkMutationBasis(client, work);
  }
  if (bytes) await requireAssemblyBytesCapabilities(client, verified);
  return work;
}
export async function requireAssemblyBytesCapabilities(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) {
  for (const action of ["view", "download"] as const) {
    const failure = await authorizeDynamicResourceCapabilityInSnapshot(client, verified, ["drawing", "model"], action);
    if (failure) assemblyError("沒有原生組立包的查看及下載權限", failure.status);
  }
}
export async function assemblyPackageSummary(client: AsyncDatabaseClient, pkg: AssemblyPackageRow) {
  const analysis = await readAssemblyAnalysis(client, pkg);
  const manifest = assemblyJson<AssemblyArchiveManifest | null>(pkg.manifest_json, null);
  const result = assemblyJson<AssemblyAnalysisResult | null>(analysis?.result_json, null);
  const overrides = assemblyJson<Record<string, Record<string, Partial<AssemblyBomRow>>>>(analysis?.overrides_json, {});
  return { packageId: pkg.id, fileName: pkg.file_name, byteSize: Number(pkg.byte_size), nextOffset: Number(pkg.next_offset),
    status: pkg.status === "accepted" ? analysis?.status ?? "queued" : pkg.status,
    archiveSha256: pkg.archive_sha256, selectionVersion: Number(pkg.selection_version), mainEntryKey: pkg.main_entry_key,
    deliveryConfigurations: assemblyJson<string[]>(pkg.configurations_json, []), primaryConflict: Number(pkg.primary_conflict) === 1,conflictingPrimaryBindingId:pkg.primary_conflict_binding_id,
    primaryBindingId: pkg.primary_binding_id, diagnostic: pkg.diagnostic,
    result: result ? { ...result, configurations: result.configurations.map(config => {
      const edits = Object.hasOwn(overrides, config.name) ? overrides[config.name] : {};
      const rows = config.bom.rows;
      const exceptionCount = rows.filter(row => !["matched", "excluded"].includes(edits[row.rowKey]?.disposition ?? row.disposition)).length;
      return { ...config, bom: { rowCount: rows.length, exceptionCount } };
    }) } : null,
    mainCandidates: manifest?.entries.filter(entry => manifest.assemblyEntryKeys.includes(entry.entryKey)).map(entry => ({ entryKey: entry.entryKey, relativePath: entry.relativePath })) ?? [],
    downloadAvailable: pkg.status === "accepted", active: Boolean(pkg.active_at && !pkg.superseded_at), ...ASSEMBLY_PACKAGE_LIMITS };
}

/** Every storage call is outside the principal/metadata transaction. Commit paths recheck admission and work state. */
export class DrawingAssemblyPackageService {
  constructor(private readonly client = getAsyncDatabaseClient()) {}
  private scope<T>(token: string, request: Request, workId: string, write: boolean,
    execute: (tx: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, work: DrawingWorkRow) => Promise<T>, bytes = false) {
    return principalRequestInput(token, request).then(input => withVerifiedJenfuPrincipalRequest({ ...input, database: this.client },
      async (tx, verified) => execute(tx, verified, await authorize(tx, verified, workId, write, bytes)),
      { readOnly: !write, isolationLevel: write ? "serializable" : "repeatable_read" }));
  }
  private owned(tx: AsyncDatabaseClient, work: DrawingWorkRow, id: string) {
    return readAssemblyPackage(tx, work.company_id, id).then(pkg => {
      if (!pkg || pkg.work_id !== work.id || pkg.revision_id !== work.revision_id) assemblyError("組立包不存在", 404);
      return pkg;
    });
  }
  async get(token: string, request: Request, workId: string, id?: string) {
    return this.scope(token, request, workId, false, async (tx, _verified, work) => {
      const pkg = id ? await this.owned(tx, work, id) : await tx.queryOne<AssemblyPackageRow>(`SELECT * FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND (status='uploading' OR (active_at IS NOT NULL AND superseded_at IS NULL)) ORDER BY CASE WHEN status='uploading' THEN 0 ELSE 1 END,created_at DESC LIMIT 1`, { companyId: work.company_id, workId });
      const previous = !id && pkg?.status === "uploading" ? await tx.queryOne<AssemblyPackageRow>(`SELECT * FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND active_at IS NOT NULL AND superseded_at IS NULL`, {companyId:work.company_id,workId}) : null;
      return { data: pkg ? await assemblyPackageSummary(tx, pkg) : null, previousActive: previous ? await assemblyPackageSummary(tx,previous) : null, limits: ASSEMBLY_PACKAGE_LIMITS };
    });
  }
  async start(token: string, request: Request, workId: string, input: { fileName?: unknown; byteSize?: unknown; activePackageId?: unknown }, key: string) {
    const fileName = typeof input.fileName === "string" ? input.fileName.trim() : "";
    const size = Number(input.byteSize);
    if (!key || key.length > 200 || !fileName.toLowerCase().endsWith(".zip") || fileName.length > 255 || /[\\/\u0000-\u001f]/u.test(fileName) || !Number.isSafeInteger(size) || size < 22) assemblyError("請選擇有效 ZIP 並提供上傳識別", 422);
    if (size > ASSEMBLY_PACKAGE_LIMITS.maxArchiveBytes) assemblyError("ZIP 超過 256 MiB 上限", 413);
    const requestHash = digest({ fileName, byteSize: size, activePackageId: input.activePackageId ?? null });
    const pkg = await this.scope(token, request, workId, true, async (tx, verified, work) => {
      const same = await tx.queryOne<AssemblyPackageRow>(`SELECT * FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND initiator_principal_id=:principalId AND idempotency_key=:key`, { companyId: work.company_id, workId, principalId: verified.session.principalId, key });
      if (same) { if (same.request_hash !== requestHash) assemblyError("同一上傳識別的宣告不同"); return same; }
      const active = await tx.queryOne<{id:string}>(`SELECT id FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND active_at IS NOT NULL AND superseded_at IS NULL`, { companyId: work.company_id, workId });
      if ((active?.id ?? null) !== (input.activePackageId ?? null)) assemblyError("組立包來源已更新，請重新讀取");
      const pending = await tx.queryOne(`SELECT id FROM drawing_assembly_packages WHERE company_id=:companyId AND work_id=:workId AND status='uploading'`, { companyId: work.company_id, workId });
      if (pending) assemblyError("已有組立包正在上傳，請續傳或取消");
      const id = crypto.randomUUID();
      await tx.execute(`INSERT INTO drawing_assembly_packages(id,company_id,work_id,active_work_id,revision_id,active_revision_id,initiator_principal_id,initiator_authority_json,created_by,idempotency_key,request_hash,file_name,byte_size,status) VALUES(:id,:companyId,:workId,:workId,:revisionId,:revisionId,:principalId,:authority,:userId,:key,:hash,:name,:size,'uploading')`,
        { id, companyId: work.company_id, workId, revisionId: work.revision_id, principalId: verified.session.principalId, authority: JSON.stringify(principalJobInitiatorFromVerifiedRequest(verified)), userId: verified.profile.pdmUserId, key, hash: requestHash, name: fileName, size });
      return (await readAssemblyPackage(tx, work.company_id, id))!;
    });
    if (pkg.status === "uploading" && !pkg.storage_session_json) await this.ensureSession(token, request, workId, pkg);
    return this.get(token, request, workId, pkg.id);
  }
  private async ensureSession(token: string, request: Request, workId: string, pkg: AssemblyPackageRow, lease?: string) {
    if (pkg.storage_session_json) return assemblyJson<AssemblyUploadSession>(pkg.storage_session_json, null!);
    const ownedLease = lease ?? (await this.reserve(token,request,workId,pkg.id)).lease;
    if (!ownedLease) assemblyError("此上傳已結束");
    const session = await createAssemblyStorageService().startUpload({ key: buildStorageKey(["drawing-assembly-packages", pkg.company_id, pkg.work_id, pkg.id, "source.zip"]), byteSize: Number(pkg.byte_size) });
    return this.scope(token, request, workId, true, async (tx, _verified, work) => {
      const current = await this.owned(tx, work, pkg.id);
      if (current.status !== "uploading" || current.upload_lease_token !== ownedLease) assemblyError("上傳已結束或租約變更");
      if (current.storage_session_json) return assemblyJson<AssemblyUploadSession>(current.storage_session_json, null!);
      await tx.execute(`UPDATE drawing_assembly_packages SET storage_session_json=:session,upload_lease_token=:lease,upload_lease_expires_at=:expires,updated_at=CURRENT_TIMESTAMP WHERE id=:id`, { id: pkg.id, session: JSON.stringify(session), lease:lease ?? null, expires:lease ? new Date(Date.now()+240_000).toISOString() : null });
      return session;
    });
  }
  private async reserve(token: string, request: Request, workId: string, id: string) {
    return this.scope(token, request, workId, true, async (tx, verified, work) => {
      const pkg = await this.owned(tx, work, id);
      if (pkg.initiator_principal_id !== verified.session.principalId) assemblyError("只有發起者可續傳", 403);
      if (pkg.status !== "uploading") return { pkg, lease: null };
      if (pkg.upload_lease_token && Date.parse(String(pkg.upload_lease_expires_at)) > Date.now()) assemblyError("上傳分段處理中，請稍候讀回進度");
      const lease = crypto.randomUUID();
      await tx.execute(`UPDATE drawing_assembly_packages SET upload_lease_token=:lease,upload_lease_expires_at=:expires WHERE id=:id`, { id, lease, expires: new Date(Date.now() + 240_000).toISOString() });
      return { pkg, lease };
    });
  }
  async content(token: string, request: Request, workId: string, id: string, range: string | null, bytes: Buffer) {
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/u.exec(range ?? "");
    if (!match || match.slice(1).some(value=>!Number.isSafeInteger(Number(value))) || bytes.length < 1 || bytes.length > ASSEMBLY_PACKAGE_LIMITS.chunkBytes || Number(match[2]) - Number(match[1]) + 1 !== bytes.length || Number(match[2])>=Number(match[3]) || (Number(match[2])+1<Number(match[3]) && bytes.length!==ASSEMBLY_PACKAGE_LIMITS.chunkBytes)) assemblyError("分段範圍無效", 422);
    const { pkg, lease } = await this.reserve(token, request, workId, id);
    if (!lease || Number(match[3]) !== Number(pkg.byte_size)) assemblyError("上傳來源或大小已改變");
    const storage = createAssemblyStorageService();
    const session = await this.ensureSession(token, request, workId, pkg, lease);
    try {
      let status = await storage.getUploadStatus(session);
      if (status.nextOffset === Number(match[1])) status = await storage.putChunk(session, Number(match[1]), bytes);
      await this.scope(token, request, workId, true, async (tx, _verified, work) => {
        const current = await this.owned(tx, work, id);
        if (current.upload_lease_token !== lease || Date.parse(String(current.upload_lease_expires_at))<=Date.now() || current.status !== "uploading") assemblyError("上傳租約已變更");
        await tx.execute(`UPDATE drawing_assembly_packages SET next_offset=:offset,storage_object_json=:object,upload_lease_token=NULL,upload_lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=:id`, { id, offset: status.nextOffset, object: status.object ? JSON.stringify(status.object) : null });
      });
      return { packageId: id, nextOffset: status.nextOffset, ...ASSEMBLY_PACKAGE_LIMITS };
    } catch (error) { await this.releaseLease(id, lease); throw error; }
  }
  private async releaseLease(id: string, lease: string) {
    await this.client.execute(`UPDATE drawing_assembly_packages SET upload_lease_token=NULL,upload_lease_expires_at=NULL WHERE id=:id AND upload_lease_token=:lease`, { id, lease });
  }
  async finalize(token: string, request: Request, workId: string, id: string) {
    const { pkg, lease } = await this.reserve(token, request, workId, id);
    if (pkg.status === "accepted") return this.get(token, request, workId, id);
    if (!lease) assemblyError("上傳已取消");
    try {
      const session = await this.ensureSession(token, request, workId, pkg, lease);
      const storage = createAssemblyStorageService();
      const status = await storage.getUploadStatus(session);
      if (!status.object || status.nextOffset !== Number(pkg.byte_size)) assemblyError("組立包尚未傳完");
      const manifest = await validateAssemblyArchive(await storage.openObject(status.object));
      await this.scope(token, request, workId, true, async (tx, _verified, work) => {
        const current = await this.owned(tx, work, id);
        if (current.status !== "uploading" || current.upload_lease_token !== lease || Date.parse(String(current.upload_lease_expires_at))<=Date.now()) assemblyError("上傳租約已變更");
        await tx.execute(`UPDATE drawing_assembly_packages SET superseded_at=CURRENT_TIMESTAMP WHERE company_id=:companyId AND work_id=:workId AND active_at IS NOT NULL AND superseded_at IS NULL`, { companyId: work.company_id, workId });
        const mainEntryKey = manifest.assemblyEntryKeys.length === 1 ? manifest.assemblyEntryKeys[0] : null;
        await tx.execute(`UPDATE drawing_assembly_packages SET status='accepted',storage_object_json=:object,manifest_json=:manifest,archive_sha256=:hash,main_entry_key=:main,next_offset=:size,active_at=CURRENT_TIMESTAMP,upload_lease_token=NULL,upload_lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=:id`, { id, object: JSON.stringify(status.object), manifest: JSON.stringify(manifest), hash: manifest.sha256, main: mainEntryKey, size: Number(pkg.byte_size) });
        await queueAssemblyAnalysis(tx, (await readAssemblyPackage(tx, work.company_id, id))!);
      });
      return this.get(token, request, workId, id);
    } catch (error) {
      if(error instanceof AssemblyArchiveError) await this.scope(token,request,workId,true,async(tx,_verified,work)=>{
        const current=await this.owned(tx,work,id);
        if(current.status==='uploading' && current.upload_lease_token===lease)await tx.execute(`UPDATE drawing_assembly_packages SET status='rejected',diagnostic=:diagnostic,upload_lease_token=NULL,upload_lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=:id`,{id,diagnostic:error.code});
      }).catch(()=>{});
      await this.releaseLease(id, lease); throw error;
    }
  }
  async cancel(token: string, request: Request, workId: string, id: string) {
    return this.scope(token, request, workId, true, async (tx, verified, work) => {
      const pkg = await this.owned(tx, work, id);
      if (pkg.initiator_principal_id !== verified.session.principalId) assemblyError("只有發起者可取消", 403);
      if (pkg.status !== "uploading" || (pkg.upload_lease_token && Date.parse(String(pkg.upload_lease_expires_at)) > Date.now())) assemblyError("此上傳目前不能取消");
      await tx.execute(`UPDATE drawing_assembly_packages SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=:id`, { id });
      return { packageId: id, status: "cancelled" };
    });
  }
  async download(token: string, request: Request, workId: string, id: string) {
    const pkg = await this.scope(token, request, workId, false, (tx, _verified, work) => this.owned(tx, work, id), true);
    return assemblyDownloadResponse(pkg);
  }
  async select(token:string,request:Request,workId:string,id:string,input:Record<string,unknown>,key:string) {
    if (!key || key.length>200) assemblyError("缺少操作識別",422);
    const selected = await this.scope(token,request,workId,true,(tx,verified,work)=>runPrincipalDev087Command(tx,verified,{
      command:"drawing.assembly.select",idempotencyKey:key,request:{workId,id,...input},effectKey:`assembly-package:${id}:selection`,correlationId:crypto.randomUUID()
    },async()=>{
      const pkg=await this.owned(tx,work,id);
      if (pkg.status!=="accepted" || !pkg.active_at || pkg.superseded_at || Number(input.selectionVersion)!==Number(pkg.selection_version)) assemblyError("組立包選擇已更新，請重新讀取");
      if (input.acceptPrimaryReplacement===true && (!pkg.primary_conflict_binding_id || input.conflictingPrimaryBindingId!==pkg.primary_conflict_binding_id)) assemblyError("3D 主檔已改變，請重新核對");
      const manifest=assemblyJson<AssemblyArchiveManifest>(pkg.manifest_json,null!);
      const main=input.mainEntryKey===undefined ? pkg.main_entry_key : input.mainEntryKey;
      if (main!==null && (typeof main!=="string" || !manifest.assemblyEntryKeys.includes(main))) assemblyError("主組立不在此包內",422);
      const previousAnalysis=await readAssemblyAnalysis(tx,pkg);
      const currentResult=assemblyJson<AssemblyAnalysisResult|null>(previousAnalysis?.result_json,null);
      const configurations=input.deliveryConfigurations===undefined ? assemblyJson<string[]>(pkg.configurations_json,[]) : input.deliveryConfigurations;
      const known=new Set([...(currentResult?.configurations.map(value=>value.name)??[]),...(currentResult?.configurationNames??[])]);
      if (!Array.isArray(configurations) || configurations.length>64 || configurations.some(value=>typeof value!=="string" || !known.has(value)) || new Set(configurations).size!==configurations.length) assemblyError("請選擇已辨識的交付組態",422);
      const changed=main!==pkg.main_entry_key || JSON.stringify(configurations)!==pkg.configurations_json;
      if (changed) {
        await tx.execute(`UPDATE drawing_assembly_packages SET main_entry_key=:main,configurations_json=:configs,selection_version=selection_version+1,primary_binding_id=NULL,primary_asset_id=NULL,primary_conflict=0,primary_conflict_binding_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=:id`,{id,main,configs:JSON.stringify(configurations)});
        const next=(await readAssemblyPackage(tx,work.company_id,id))!;
        await queueAssemblyAnalysis(tx,next);
        await deriveAssemblySelectionFromCache(tx,next,previousAnalysis);
      }
      return {selectionVersion:Number(pkg.selection_version)+(changed?1:0),mainEntryKey:main,acceptPrimaryReplacement:input.acceptPrimaryReplacement===true,observedBindingId:pkg.primary_conflict_binding_id};
    }));
    if (selected.mainEntryKey) await bindAssemblyPackageMain({client:this.client,companyId:(await this.scope(token,request,workId,false,async(_tx,_v,w)=>w.company_id)),packageId:id,selectionVersion:selected.selectionVersion,mainEntryKey:String(selected.mainEntryKey),confirmPrimaryReplacement:selected.acceptPrimaryReplacement,observedBindingId:selected.observedBindingId});
    return this.get(token,request,workId,id);
  }
  async bom(token:string,request:Request,workId:string,id:string,configuration:string,input?:Record<string,unknown>) {
    return this.scope(token,request,workId,Boolean(input),async(tx,verified,work)=>{
      const pkg=await this.owned(tx,work,id);
      const analysis=await readAssemblyAnalysis(tx,pkg);
      if (!analysis) assemblyError("BOM 草稿尚未產生");
      const result=assemblyJson<AssemblyAnalysisResult|null>(analysis.result_json,null);
      const overrides=assemblyJson<Record<string,Record<string,Partial<AssemblyBomRow>>>>(analysis.overrides_json,{});
      const bom=assemblyBomProjection(result,overrides,configuration);
      if (!bom) assemblyError("指定組態的草稿尚未產生",404);
      if (input) {
        if (!pkg.active_at || pkg.superseded_at || work.handling!=="owner" || Number(input.draftVersion)!==Number(analysis.draft_version)) assemblyError("BOM 草稿已更新，請重新讀取");
        if (typeof input.rowKey!=="string" || !bom.rows.some(row=>row.rowKey===input.rowKey)) assemblyError("草稿列不存在",404);
        const patch:Partial<AssemblyBomRow>={};
        if ("quantity" in input) {try {patch.quantity=normalizeAssemblyQuantity(input.quantity);} catch {assemblyError("用量需為正十進位字串或未知值",422);}}
        if ("unit" in input) {if(input.unit!==null && (typeof input.unit!=="string" || !input.unit.trim() || input.unit.length>40)) assemblyError("單位無效",422);patch.unit=typeof input.unit==='string'?input.unit.trim():null;}
        if ("disposition" in input) {if(typeof input.disposition!=="string" || !["matched","excluded","needs_record","needs_number","needs_purpose","needs_mapping","quantity_unknown","conflict","material"].includes(input.disposition)) assemblyError("用途分類無效",422);patch.disposition=input.disposition;
          const row=bom.rows.find(row=>row.rowKey===input.rowKey)!;
          if(input.disposition==="material" && !row.partId && !row.cadPartNumber && !row.drawingNumber)patch.disposition="needs_number";
        }
        if ("partId" in input) {
          patch.partId=null;
          if(input.partId!==null) {
            const denied=await authorizeDynamicResourceCapabilityInSnapshot(tx,verified,["part"],"view");if(denied) assemblyError("沒有料號查看權限",denied.status);
            if(typeof input.partId!=="string") assemblyError("料號無效",422);
            const part=await tx.queryOne<{id:string;part_number:string}>(`SELECT id,part_number FROM part_numbers WHERE company_id=:companyId AND id=:id AND record_status NOT IN ('Obsolete','Merged','Cancelled')`,{companyId:work.company_id,id:input.partId});
            if(!part) assemblyError("料號不存在",404);patch.partId=part.id;patch.partNumber=part.part_number;if(!("disposition" in input))patch.disposition="matched";
          } else {patch.partNumber=null;if(!('disposition' in input)){const row=bom.rows.find(row=>row.rowKey===input.rowKey)!;patch.disposition=row.cadPartNumber||row.drawingNumber?'needs_record':'needs_purpose';}}
        }
        if('quantity' in input && !('disposition' in input)) {
          const row=bom.rows.find(row=>row.rowKey===input.rowKey)!;
          if(patch.quantity===null && row.disposition!=='excluded')patch.disposition='quantity_unknown';
          else if(row.disposition==='quantity_unknown')patch.disposition=(patch.partId??row.partId)?'matched':row.cadPartNumber||row.drawingNumber?'needs_record':'needs_purpose';
        }
        if(patch.disposition==='matched' && !(Object.hasOwn(patch,'partId')?patch.partId:bom.rows.find(row=>row.rowKey===input.rowKey)?.partId))assemblyError("請先關聯有效料號",422);
        if(!Object.keys(patch).length) assemblyError("沒有可保存的草稿欄位",422);
        if(!Object.hasOwn(overrides,configuration)) Object.defineProperty(overrides,configuration,{value:Object.create(null),enumerable:true,writable:true,configurable:true});
        overrides[configuration][input.rowKey]={...(Object.hasOwn(overrides[configuration],input.rowKey)?overrides[configuration][input.rowKey]:{}),...patch};
        await tx.execute(`UPDATE drawing_assembly_analysis SET overrides_json=:overrides,draft_version=draft_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=:id AND draft_version=:version`,{id:analysis.id,version:Number(analysis.draft_version),overrides:JSON.stringify(overrides)});
      }
      const projected=assemblyBomProjection(result,overrides,configuration)!;
      const denial=await authorizeDynamicResourceCapabilityInSnapshot(tx,verified,["part"],"view");
      if(denial) projected.rows=projected.rows.map(({partId:_partId,partNumber:_partNumber,...row})=>row as AssemblyBomRow);
      return {data:{packageId:id,configuration,draftVersion:Number(analysis.draft_version)+(input?1:0),...projected}};
    });
  }
}

export async function assemblyDownloadResponse(pkg: Pick<AssemblyPackageRow,"status"|"storage_object_json"|"file_name"|"byte_size"|"archive_sha256">) {
  if (pkg.status !== "accepted" || !pkg.storage_object_json) assemblyError("組立包尚未安全收件", 409);
  const source = await createAssemblyStorageService().openObject(assemblyJson<AssemblyStoredObject>(pkg.storage_object_json, null!));
  return new Response(Readable.toWeb(Readable.from(source.stream())) as ReadableStream<Uint8Array>, { headers: { "content-type": "application/zip", "content-length": String(pkg.byte_size), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(pkg.file_name)}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "etag": `"${pkg.archive_sha256}"` } });
}

/** Call after a validated worker result commits. No object I/O runs under a DB lock. */
export async function bindAssemblyPackageMain(input:{client:AsyncDatabaseClient;companyId:string;packageId:string;selectionVersion:number;mainEntryKey:string;confirmPrimaryReplacement?:boolean;observedBindingId?:string|null}) {
  const {client,companyId,packageId}=input;
  const pkg=await readAssemblyPackage(client,companyId,packageId);
  if(!pkg || Number(pkg.selection_version)!==input.selectionVersion || pkg.main_entry_key!==input.mainEntryKey) assemblyError("組立包來源已改變");
  await client.transaction(tx=>requireAssemblyPackageJobAuthority(tx,pkg),{readOnly:true,isolationLevel:"repeatable_read"});
  const manifest=assemblyJson<AssemblyArchiveManifest>(pkg.manifest_json,null!);
  const entry=manifest?.entries.find(value=>value.entryKey===input.mainEntryKey);
  if(!entry || !/\.sldasm$/iu.test(entry.relativePath)) assemblyError("主組立來源無效",422);
  const current=await client.queryOne<{id:string;source_file_asset_id:string;content_hash:string}>(`SELECT file.id,file.source_file_asset_id,asset.content_hash FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id=binding.file_binding_id JOIN file_assets asset ON asset.id=file.source_file_asset_id WHERE binding.work_id=:workId AND file.company_id=:companyId AND file.role='cad_3d' AND file.is_primary=1 AND file.removed_at IS NULL AND asset.deleted_at IS NULL`,{workId:pkg.work_id,companyId});
  if(current && current.id===pkg.primary_binding_id && current.source_file_asset_id===pkg.primary_asset_id && current.content_hash===entry.sha256) return {bound:true,conflict:false};
  if(current && current.content_hash!==entry.sha256 && !input.confirmPrimaryReplacement) {
    await client.transaction(async tx=>{
      const work=await new DrawingRevisionWorkAsyncRepository(tx).readWork(tx,companyId,pkg.work_id,true);
      const locked=await readAssemblyPackage(tx,companyId,packageId,{lock:true});
      if(!work || work.handling!=="owner" || !locked?.active_at || locked.superseded_at || Number(locked.selection_version)!==input.selectionVersion) assemblyError("組立包來源已改變");
      await tx.execute(`UPDATE drawing_assembly_packages SET primary_conflict=1,primary_conflict_binding_id=:bindingId,updated_at=CURRENT_TIMESTAMP WHERE id=:id`,{id:packageId,bindingId:current.id});
    },{isolationLevel:"serializable"});
    return {bound:false,conflict:true};
  }
  if(current && current.content_hash!==entry.sha256 && input.confirmPrimaryReplacement &&
    (pkg.primary_conflict_binding_id!==current.id || input.observedBindingId!==undefined && input.observedBindingId!==current.id)) assemblyError("3D 主檔已改變，請重新讀取並確認切換");
  const maxBytes=getStorageUploadPolicy().maxUploadFileMb*1024*1024;
  if(entry.byteSize>maxBytes) assemblyError("包內主組立超過受控主檔上限",413);
  const storage=createAssemblyStorageService();
  const bytes=await extractAssemblyArchiveEntry(await storage.openObject(assemblyJson<AssemblyStoredObject>(pkg.storage_object_json,null!)),manifest,input.mainEntryKey,maxBytes);
  const work=await new DrawingRevisionWorkAsyncRepository(client).readWork(client,companyId,pkg.work_id);
  if(!work) assemblyError("圖面工作不存在",404);
  const {issueCanonicalWorkbenchContract}=await import("@/lib/pdm-workbench-authority-control");
  const {uploadDrawingRevisionWorkFile}=await import("@/lib/drawing-revision-work-file");
  await uploadDrawingRevisionWorkFile({client,workId:pkg.work_id,file:new File([new Uint8Array(bytes)],entry.relativePath.split("/").at(-1)!,{type:"application/octet-stream"}),
    actor:{id:pkg.created_by,principalId:pkg.initiator_principal_id,companyId,canEditNonOwned:true,permissions:{update:true}},
    context:{idempotencyKey:`assembly-primary:${packageId}:${input.selectionVersion}:${entry.sha256}`,contractToken:await issueCanonicalWorkbenchContract(client,{companyId,actorId:pkg.created_by}),expectedRowVersion:Number(work.row_version)},
    packageBinding:{packageId,selectionVersion:input.selectionVersion,mainEntryKey:input.mainEntryKey,confirmPrimaryReplacement:input.confirmPrimaryReplacement===true,expectedPrimaryBindingId:pkg.primary_conflict_binding_id},
    packageInitiator:parsePrincipalJobInitiator(pkg.initiator_authority_json)??undefined,
    validatePackageAuthority:async tx=>{const active=await readAssemblyPackage(tx,companyId,packageId);if(!active) assemblyError("組立包不存在",404);await requireAssemblyPackageJobAuthority(tx,active);}
  });
  return {bound:true,conflict:false};
}
