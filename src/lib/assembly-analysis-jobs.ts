import { randomUUID } from "node:crypto";
import type { VerifiedWindowsServiceDevice } from "./windows-service-device-auth";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "./db-async-provider";
import {
  assemblyJson, assemblyDownloadResponse, bindAssemblyPackageMain,
  readAssemblyPackage, requireAssemblyPackageJobAuthority, type AssemblyPackageRow
} from "./drawing-assembly-package";
import type { AssemblyArchiveManifest } from "./assembly-archive";
import { projectAssemblyAnalysisResult } from "./drawing-assembly-bom";
import { validateAssemblyAnalysisResult, assemblyResultDigest } from "./assembly-analysis-result";
import { DrawingRevisionWorkAsyncRepository } from "./repositories/drawing-revision-work-async-repository";
import { mergeAssemblyRawCache, readAssemblyRawCache } from "./drawing-assembly-cache";
import { isSupportedAssemblyParserVersion } from "./assembly-parser-version";

type Actor = Pick<VerifiedWindowsServiceDevice, "id" | "companyId" | "ownerPrincipalId">;
type Job = {
  id: string; package_id: string; selection_version: number; status: string; lease_version: number;
  lease_token: string | null; lease_owner_id: string | null; live: boolean; result_digest: string | null;
};
export type AssemblyLease = { token: string; version: number; packageId: string; selectionVersion: number; archiveSha256: string };
function reject(code: string, status = 409): never { throw Object.assign(new Error(code), {code, status}); }
export function readAssemblyLease(request: Request): AssemblyLease {
  const value = request.headers.get("x-pdm-assembly-lease");
  if (!value || value.length > 2048) reject("ASSEMBLY_LEASE_REQUIRED", 403);
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (parsed.leaseProtocolVersion === 1 && typeof parsed.leaseBasis?.token === "string" &&
        Number.isSafeInteger(parsed.leaseBasis.version)) return parsed.leaseBasis;
  } catch { /* Return the same denial for malformed and absent leases. */ }
  return reject("ASSEMBLY_LEASE_REQUIRED", 403);
}
function manifestOf(pkg: AssemblyPackageRow) {
  const manifest = assemblyJson<AssemblyArchiveManifest | null>(pkg.manifest_json, null);
  if (!manifest || manifest.sha256 !== pkg.archive_sha256) reject("ASSEMBLY_MANIFEST_MISMATCH");
  return manifest;
}
async function ownedJob(tx: AsyncDatabaseClient, actor: Actor, id: string, lock = false) {
  return tx.queryOne<Job>(`SELECT a.*,lease_expires_at>CURRENT_TIMESTAMP AS live FROM drawing_assembly_analysis a
    WHERE id=:id AND company_id=:companyId AND initiator_principal_id=:principal${lock ? " FOR UPDATE" : ""}`,
    {id, companyId: actor.companyId, principal: actor.ownerPrincipalId});
}
async function checked(tx: AsyncDatabaseClient, actor: Actor, id: string, lease: AssemblyLease, lock = false) {
  if (lock) {
    const identity = await readAssemblyPackage(tx, actor.companyId, lease.packageId);
    if (!identity || identity.initiator_principal_id !== actor.ownerPrincipalId) reject("ASSEMBLY_LEASE_INVALID",403);
    await new DrawingRevisionWorkAsyncRepository(tx).readWork(tx,actor.companyId,identity.work_id,true);
  }
  const pkg = await readAssemblyPackage(tx, actor.companyId, lease.packageId, {lock});
  const job = await ownedJob(tx, actor, id, lock);
  if (!pkg || !job || job.status !== "running" || !job.live || job.lease_owner_id !== actor.id ||
      job.lease_token !== lease.token || job.lease_version !== lease.version || job.package_id !== pkg.id ||
      job.selection_version !== lease.selectionVersion || pkg.selection_version !== job.selection_version ||
      pkg.archive_sha256 !== lease.archiveSha256 || pkg.initiator_principal_id !== actor.ownerPrincipalId) reject("ASSEMBLY_LEASE_INVALID", 403);
  await requireAssemblyPackageJobAuthority(tx, pkg);
  return pkg;
}
export function verifyAssemblyLease(actor: Actor, id: string, lease: AssemblyLease) {
  return getAsyncDatabaseClient().transaction(tx => checked(tx, actor, id, lease), {isolationLevel:"repeatable_read"});
}
export async function claimAssemblyAnalysis(actor: Actor, parserVersion: string) {
  if(!isSupportedAssemblyParserVersion(parserVersion))reject("ASSEMBLY_PARSER_VERSION_UNSUPPORTED",426);
  return getAsyncDatabaseClient().transaction(async tx => {
    const candidates = await tx.query<{id:string;package_id:string;work_id:string}>(`SELECT a.id,a.package_id,p.work_id
      FROM drawing_assembly_analysis a JOIN drawing_assembly_packages p ON p.company_id=a.company_id AND p.id=a.package_id
      AND p.selection_version=a.selection_version WHERE a.company_id=:company AND a.initiator_principal_id=:principal
      AND p.active_at IS NOT NULL AND p.superseded_at IS NULL AND (a.status='queued' OR
      (a.status='running' AND a.lease_expires_at<=CURRENT_TIMESTAMP)) ORDER BY a.created_at,a.id LIMIT 20`,
      {company:actor.companyId, principal:actor.ownerPrincipalId});
    for (const candidate of candidates) {
      await new DrawingRevisionWorkAsyncRepository(tx).readWork(tx,actor.companyId,candidate.work_id,true);
      const pkg = await readAssemblyPackage(tx, actor.companyId, candidate.package_id,{lock:true});
      if (!pkg || !pkg.active_at || pkg.superseded_at) continue;
      const available = await tx.queryOne<{attempts:number}>(`SELECT attempts FROM drawing_assembly_analysis
        WHERE id=:id AND selection_version=:version AND (status='queued' OR (status='running' AND lease_expires_at<=CURRENT_TIMESTAMP))
        FOR UPDATE SKIP LOCKED`,{id:candidate.id,version:pkg.selection_version});
      if (!available) continue;
      try { await requireAssemblyPackageJobAuthority(tx, pkg); }
      catch (error) {
        if (![403,404,409].includes(Number((error as {status?:number}).status))) throw error;
        await tx.execute("UPDATE drawing_assembly_analysis SET status='blocked',updated_at=CURRENT_TIMESTAMP WHERE id=:id", {id:candidate.id});
        continue;
      }
      if (available.attempts >= 4) {
        await tx.execute("UPDATE drawing_assembly_analysis SET status='blocked',updated_at=CURRENT_TIMESTAMP WHERE id=:id", {id:candidate.id});
        await tx.execute("UPDATE drawing_assembly_packages SET diagnostic='Windows 解析多次中斷' WHERE id=:id", {id:pkg.id});
        continue;
      }
      const token = randomUUID();
      const row = await tx.queryOne<{lease_version:number}>(`UPDATE drawing_assembly_analysis SET status='running',
        lease_version=lease_version+1, lease_owner_id=:owner,lease_token=:token,attempts=attempts+1,parser_version=:parserVersion,
        lease_expires_at=CURRENT_TIMESTAMP+interval '90 seconds',updated_at=CURRENT_TIMESTAMP WHERE id=:id RETURNING lease_version`,
        {id:candidate.id,owner:actor.id,token,parserVersion});
      const leaseBasis = {token,version:row!.lease_version,packageId:pkg.id,selectionVersion:pkg.selection_version,archiveSha256:pkg.archive_sha256};
      const manifest = manifestOf(pkg);
      const selected = assemblyJson<string[]>(pkg.configurations_json,[]);
      const cache = await readAssemblyRawCache(tx,pkg,parserVersion);
      const remaining = selected.filter(name => !cache.configurations.some(config => config.name === name));
      return {jobId:candidate.id,leaseBasis,packageId:pkg.id,archiveSha256:pkg.archive_sha256,byteSize:manifest.byteSize,
        entries:manifest.entries.filter(entry=>!entry.directory).map(({entryKey,relativePath,sha256,byteSize,method,dataOffset,compressedSize}) =>
          ({entryKey,relativePath,sha256,byteSize,method,dataOffset,compressedSize})),
        mainEntryKey:pkg.main_entry_key,deliveryConfigurations:remaining.length ? remaining : selected};
    }
    return null;
  });
}
export async function pulseAssembly(actor: Actor, id: string, lease: AssemblyLease) {
  return getAsyncDatabaseClient().transaction(async tx => {
    await checked(tx,actor,id,lease,true);
    await tx.execute("UPDATE drawing_assembly_analysis SET lease_expires_at=CURRENT_TIMESTAMP+interval '90 seconds' WHERE id=:id",{id});
    return {ok:true};
  });
}
export async function assemblyJobContent(actor: Actor, id: string, lease: AssemblyLease) {
  return assemblyDownloadResponse(await verifyAssemblyLease(actor,id,lease));
}
export async function assemblyJobReceipt(actor: Actor,id: string) {
  const job = await ownedJob(getAsyncDatabaseClient(),actor,id);
  if (!job || job.lease_owner_id !== actor.id) reject("ASSEMBLY_JOB_NOT_FOUND",404);
  return {kind:"assembly_analysis",jobId:id,status:job.status,completion:job.result_digest ? {workerId:actor.id,resultDigest:job.result_digest}:null};
}
export async function finishAssembly(actor: Actor, id: string, lease: AssemblyLease, raw: unknown) {
  const client = getAsyncDatabaseClient();
  const result = await client.transaction(async tx => {
    const pkg = await checked(tx,actor,id,lease,true);
    const selected = assemblyJson<string[]>(pkg.configurations_json,[]);
    const manifest = manifestOf(pkg);
    const fresh = validateAssemblyAnalysisResult(raw,manifest,pkg.main_entry_key,[]);
    const claimed=await tx.queryOne<{parser_version:string}>("SELECT parser_version FROM drawing_assembly_analysis WHERE id=:id",{id});
    if(claimed?.parser_version!==fresh.parserVersion)reject("ASSEMBLY_PARSER_VERSION_MISMATCH",422);
    const combined = selected.length ? mergeAssemblyRawCache(await readAssemblyRawCache(tx,pkg,fresh.parserVersion),fresh,selected) : fresh;
    const result = validateAssemblyAnalysisResult(combined,manifest,pkg.main_entry_key,selected);
    if (result.mainEntryKey) {
      const configurations = selected.length ? selected : result.configurations.map(config=>config.name);
      await tx.execute("UPDATE drawing_assembly_packages SET main_entry_key=:main,configurations_json=:configs WHERE id=:id",
        {id:pkg.id,main:result.mainEntryKey,configs:JSON.stringify(configurations)});
    }
    return result;
  });
  if (result.mainEntryKey) await bindAssemblyPackageMain({client,companyId:actor.companyId,packageId:lease.packageId,
    selectionVersion:lease.selectionVersion,mainEntryKey:result.mainEntryKey});
  return client.transaction(async tx => {
    const pkg = await checked(tx,actor,id,lease,true);
    const projected = await projectAssemblyAnalysisResult(tx,pkg,result);
    const digest = assemblyResultDigest(raw);
    await tx.execute(`UPDATE drawing_assembly_analysis SET status=:status,result_json=:json,raw_result_json=:raw,result_digest=:digest,
      parser_version=:parser,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=:id`,
      {id,status:result.status,json:JSON.stringify(projected),raw:JSON.stringify(result),digest,parser:result.parserVersion});
    return {resultDigest:digest};
  });
}
