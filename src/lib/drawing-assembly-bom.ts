import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { parsePrincipalJobInitiator } from "@/lib/principal-job-authority";
import type { AssemblyPackageRow } from "@/lib/drawing-assembly-package";
import type { AssemblyAnalysisResult as NativeAssemblyAnalysisResult } from "@/lib/assembly-analysis-result";
import { isSharedDailySystemTestAdministrator, requireSharedDailySystemTestAdminOperations } from "@/lib/shared-daily-system-test-admin";
import { requirePublishedPrincipalCatalog } from "@/lib/jenfu-principal-role-catalog";
import type { AssemblyArchiveManifest } from "@/lib/assembly-archive";
import permissionRegistry from "../../config/access-control/role-policy-editor-registry.v3.json" with { type: "json" };
export type AssemblyBomRow = {
  rowKey: string; parentKey: string | null; entryKey: string | null; configuration: string;
  occurrencePath?: string; occurrenceKey?:string; cadPartNumber?: string | null; drawingNumber?: string | null;
  quantity: string | null; unit: string | null; disposition: string; partId?: string | null;
  partNumber?: string | null; evidence?: unknown; [key: string]: unknown;
};
export type AssemblyConfigurationResult = { name: string; references: NativeAssemblyAnalysisResult["configurations"][number]["references"]; bom: { rows: AssemblyBomRow[]; [key: string]: unknown } };
export type AssemblyAnalysisResult = Omit<NativeAssemblyAnalysisResult,"configurations"> & {configurations:AssemblyConfigurationResult[]};

/** Positive decimal strings are kept exact, never converted through floating point. */
export function normalizeAssemblyQuantity(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 80 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) throw new Error("ASSEMBLY_QUANTITY_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  const result = normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
  if (!/[1-9]/u.test(result)) throw new Error("ASSEMBLY_QUANTITY_INVALID");
  return result;
}
export function addAssemblyQuantities(left: string, right: string): string {
  const [lw, lf = ""] = left.split("."), [rw, rf = ""] = right.split(".");
  const scale = Math.max(lf.length, rf.length);
  const total = (BigInt(lw + lf.padEnd(scale, "0")) + BigInt(rw + rf.padEnd(scale, "0"))).toString().padStart(scale + 1, "0");
  return normalizeAssemblyQuantity(scale ? `${total.slice(0, -scale)}.${total.slice(-scale)}` : total)!;
}
const stableHash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function assemblyBomRowKey(pkg: Pick<AssemblyPackageRow, "archive_sha256" | "main_entry_key">, configuration: string, row: Pick<AssemblyBomRow,"parentKey"|"entryKey"|"configuration"|"occurrencePath"|"occurrenceKey">) {
  return stableHash(["assembly-bom-row-v1", pkg.archive_sha256, pkg.main_entry_key, configuration, row.parentKey, row.entryKey, row.configuration, row.occurrencePath??row.occurrenceKey]);
}
export function aggregateAssemblyBomRows(rows:AssemblyBomRow[],sourceIdentity:unknown):AssemblyBomRow[] {
  const byKey=new Map(rows.map(row=>[row.rowKey,row])),children=new Map<string,AssemblyBomRow[]>();
  for(const row of rows)if(row.parentKey && byKey.has(row.parentKey)){const list=children.get(row.parentKey)??[];list.push(row);children.set(row.parentKey,list);}
  const signatures=new Map<string,string|null>();
  const fingerprint=(row:AssemblyBomRow,ancestors:Set<string>):string|null=>{
    if(signatures.has(row.rowKey))return signatures.get(row.rowKey)!;
    if(ancestors.has(row.rowKey) || ancestors.size>256)return null;
    const next=new Set(ancestors);next.add(row.rowKey);
    const nested=(children.get(row.rowKey)??[]).map(child=>fingerprint(child,next));
    const signature=nested.some(value=>value===null)?null:stableHash([row.entryKey,row.configuration,row.partId,row.unit,row.disposition,row.quantity,nested.sort()]);
    signatures.set(row.rowKey,signature);return signature;
  };
  for(const row of rows)fingerprint(row,new Set());
  const output:AssemblyBomRow[]=[],visited=new Set<string>();
  const emit=(siblings:AssemblyBomRow[],parent:string|null,depth=0)=>{
    if(depth>256)return;
    const groups=new Map<string,AssemblyBomRow[]>();
    for(const row of [...siblings].sort((a,b)=>String(a.occurrenceKey??a.rowKey).localeCompare(String(b.occurrenceKey??b.rowKey)))){
      if(visited.has(row.rowKey))continue;
      const nested=(children.get(row.rowKey)??[]).map(value=>signatures.get(value.rowKey));
      const eligible=row.entryKey && row.quantity && row.unit && row.partId && row.disposition==="matched" && !nested.some(value=>value==null);
      const key=eligible?JSON.stringify([row.entryKey,row.configuration,row.partId,row.unit,nested.sort()]):row.rowKey;
      const group=groups.get(key)??[];group.push(row);groups.set(key,group);
    }
    for(const [key,group] of groups){
      const representative=group[0];for(const row of group)visited.add(row.rowKey);
      const rowKey=group.length>1?stableHash(["assembly-bom-group-v1",sourceIdentity,parent,key]):representative.rowKey;
      output.push(group.length===1?{...representative,parentKey:parent}:{...representative,parentKey:parent,rowKey,
        quantity:group.map(value=>value.quantity!).reduce(addAssemblyQuantities),
        occurrences:group.map(value=>({occurrenceKey:value.occurrenceKey,quantity:value.quantity,evidence:value.evidence})),
        sourceEvidence:{...(representative.sourceEvidence as Record<string,unknown>),occurrencePaths:group.map(value=>value.occurrenceKey)}});
      // Equal subtree fingerprints prove the same quantities per direct parent.
      // Keep one subtree; multiplying here would count the parent quantity twice.
      emit(children.get(representative.rowKey)??[],rowKey,depth+1);
      for(const duplicate of group.slice(1)){
        const stack=[...(children.get(duplicate.rowKey)??[])];while(stack.length){const child=stack.pop()!;if(visited.has(child.rowKey))continue;visited.add(child.rowKey);stack.push(...children.get(child.rowKey)??[]);}
      }
    }
  };
  const roots=rows.filter(row=>!row.parentKey || !byKey.has(row.parentKey));
  for(const parent of new Set(roots.map(row=>row.parentKey)))emit(roots.filter(row=>row.parentKey===parent),parent);
  for(const row of rows)if(!visited.has(row.rowKey))output.push(row);
  return output;
}

export async function projectAssemblyAnalysisResult(client: AsyncDatabaseClient, pkg: AssemblyPackageRow, raw: NativeAssemblyAnalysisResult): Promise<AssemblyAnalysisResult> {
  const initiator = parsePrincipalJobInitiator(pkg.initiator_authority_json);
  let canReadParts = false;
  if (initiator) {
    const [decision] = await evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot(client, {
      principalId: initiator.principalId, employeeId: initiator.employeeId, identityIssuer: initiator.identityIssuer,
      identitySubject: initiator.identitySubject, localPrincipalId: initiator.pdmUserId, companyId: initiator.companyId, sessionSchemaVersion: 2
    }, [{ permissionKind: "action", permissionCode: "pdm.part.view" }]);
    canReadParts = decision?.allowed === true;
    if (!canReadParts && await isSharedDailySystemTestAdministrator(client, initiator)) {
      const role = (await requirePublishedPrincipalCatalog(client)).roles.find(role => role.stableRoleId === "role-system-admin");
      if (!role) throw new Error("SHARED_DAILY_SYSTEM_TEST_ADMIN_CATALOG_INVALID");
      const operations = requireSharedDailySystemTestAdminOperations(role);
      const bindings = permissionRegistry.businessActions.find(action => action.code === "pdm.part.view")!.legacyOperationBindings;
      canReadParts = bindings.length > 0 && bindings.every(binding => operations.some(operation =>
        operation.kind === binding.kind && operation.code === binding.code));
    }
  }
  // CAD identifiers have priority; otherwise match the exact manifest filename
  // against existing numbers/roots. Never use fuzzy or prefix matching.
  let manifest: AssemblyArchiveManifest | null = null;
  try { manifest = typeof pkg.manifest_json === "string" ? JSON.parse(pkg.manifest_json) : pkg.manifest_json; } catch { /* No filename evidence. */ }
  const filenames = new Map((manifest?.entries ?? []).filter(entry => !entry.directory).map(entry =>
    [entry.entryKey, entry.relativePath.split(/[\\/]/u).at(-1)!.replace(/\.(?:sldprt|sldasm)$/iu, "")]));
  const numbers = [...new Set(raw.configurations.flatMap(config => config.bom.rows.flatMap(row => [row.cadPartNumber, row.drawingNumber]).filter((value): value is string => typeof value === "string" && value.length > 0)))];
  type Candidate = { id: string; part_number: string; drawing_number: string | null };
  const partsByNumber = new Map<string, Map<string, Candidate>>();
  const partsByDrawing = new Map<string, Map<string, Candidate>>();
  const partsByFilename = new Map<string, Map<string, Candidate>>();
  function index(indexBy: Map<string, Map<string, Candidate>>, key: string | null, part: Candidate) {
    if (!key) return;
    let parts = indexBy.get(key);
    if (!parts) { parts = new Map(); indexBy.set(key, parts); }
    parts.set(part.id, part);
  }
  for (let start = 0; canReadParts && start < numbers.length; start += 500) {
    const batch = numbers.slice(start, start + 500);
    const values = Object.fromEntries(batch.map((value, i) => [`n${i}`, value]));
    const placeholders = batch.map((_, i) => `:n${i}`).join(",");
    const candidates = await client.query<Candidate>(`SELECT DISTINCT p.id,p.part_number,d.drawing_number FROM part_numbers p
      LEFT JOIN drawing_part_links relation ON relation.part_number_id=p.id
      LEFT JOIN drawing_numbers d ON d.id=relation.drawing_number_id AND d.company_id=p.company_id
      WHERE p.company_id=:companyId AND p.record_status NOT IN ('Obsolete','Merged','Cancelled')
        AND (p.part_number IN (${placeholders}) OR d.drawing_number IN (${placeholders}))`, { companyId: pkg.company_id, ...values });
    for (const candidate of candidates) {
      index(partsByNumber, candidate.part_number, candidate);
      index(partsByDrawing, candidate.drawing_number, candidate);
    }
  }
  const filenameNumbers = [...new Set(raw.configurations.flatMap(config => config.bom.rows
    .filter(row => !row.cadPartNumber && !row.drawingNumber && row.entryKey && !row.virtual)
    .map(row => filenames.get(row.entryKey!)).filter((name): name is string => Boolean(name))))];
  for (let start = 0; canReadParts && start < filenameNumbers.length; start += 500) {
    const batch = filenameNumbers.slice(start, start + 500);
    const placeholders = batch.map((_, i) => `:n${i}`).join(",");
    const candidates = await client.query<Candidate & { root_code: string | null }>(`SELECT DISTINCT p.id,p.part_number,d.drawing_number,r.root_code
      FROM part_numbers p LEFT JOIN part_roots r ON r.id=p.part_root_id AND r.company_id=p.company_id
      LEFT JOIN drawing_part_links relation ON relation.part_number_id=p.id
      LEFT JOIN drawing_numbers d ON d.id=relation.drawing_number_id AND d.company_id=p.company_id
      WHERE p.company_id=:companyId AND p.record_status NOT IN ('Obsolete','Merged','Cancelled')
        AND (p.part_number IN (${placeholders}) OR d.drawing_number IN (${placeholders}) OR r.root_code IN (${placeholders}))`,
      { companyId: pkg.company_id, ...Object.fromEntries(batch.map((value, i) => [`n${i}`, value])) });
    for (const candidate of candidates) {
      for (const key of [candidate.part_number, candidate.drawing_number, candidate.root_code]) {
        if (key && batch.includes(key)) index(partsByFilename, key, candidate);
      }
    }
  }
  const source = { ...pkg, main_entry_key: raw.mainEntryKey ?? pkg.main_entry_key };
  return { ...raw, configurations: raw.configurations.map(config => {
    const keyMap = new Map(config.bom.rows.map(row => [row.occurrenceKey, assemblyBomRowKey(source, config.name, row)]));
    const rows:AssemblyBomRow[] = config.bom.rows.map(row => {
      let quantity: string | null;
      try { quantity = normalizeAssemblyQuantity(row.quantity); } catch { quantity = null; }
      const byPart = partsByNumber.get(row.cadPartNumber ?? "");
      const byDrawing = partsByDrawing.get(row.drawingNumber ?? "");
      const filename = !row.cadPartNumber && !row.drawingNumber && row.entryKey && !row.virtual ? filenames.get(row.entryKey) : null;
      const matches = filename ? Array.from(partsByFilename.get(filename)?.values() ?? []) : row.cadPartNumber && row.drawingNumber
        ? Array.from(byPart?.values() ?? []).filter(candidate => byDrawing?.has(candidate.id))
        : Array.from((row.cadPartNumber ? byPart : byDrawing)?.values() ?? []);
      const conflicting = (row.cadPartNumber && row.drawingNumber && (byPart?.size || byDrawing?.size) && matches.length !== 1) || matches.length > 1;
      const excluded = row.disposition === "excluded";
      const match = matches.length === 1 && !conflicting ? matches[0] : null;
      const disposition = excluded ? "excluded" : quantity === null ? "quantity_unknown" : conflicting ? "conflict" : match ? "matched" : !canReadParts && (row.cadPartNumber || row.drawingNumber) ? "needs_mapping" : row.cadPartNumber || row.drawingNumber ? "needs_record" : "needs_purpose";
      return { ...row, rowKey: keyMap.get(row.occurrenceKey)!, parentKey: row.parentKey ? keyMap.get(row.parentKey) ?? row.parentKey : null,
        quantity, partId: excluded ? null : match?.id ?? null, partNumber: excluded ? null : match?.part_number ?? null,
        disposition, sourceEvidence: { packageId: pkg.id, archiveSha256: pkg.archive_sha256, mainEntryKey: source.main_entry_key, configuration: config.name, occurrencePath: row.occurrenceKey,
          ...(match && filename ? { matchBasis: "exact_manifest_filename", matchedFilename: filename } : {}) } };
    });
    return { ...config, bom: { ...config.bom, rows:aggregateAssemblyBomRows(rows,[pkg.archive_sha256,source.main_entry_key,config.name]) } };
  }) };
}

export function assemblyBomProjection(result: AssemblyAnalysisResult | null, overrides: Record<string, Record<string, Partial<AssemblyBomRow>>>, configuration: string) {
  const config = result?.configurations.find(value => value.name === configuration);
  const edits=Object.hasOwn(overrides,configuration)?overrides[configuration]:{};
  return config ? { ...config.bom, rows: config.bom.rows.map(row => ({ ...row, ...(Object.hasOwn(edits,row.rowKey)?edits[row.rowKey]:{}) }))
    .sort((a, b) => Number(["matched","excluded"].includes(a.disposition)) - Number(["matched","excluded"].includes(b.disposition))) } : null;
}
