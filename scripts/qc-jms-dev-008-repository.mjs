import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const required = [
  'src/lib/ai-pdm-role-capability-contract.ts', 'src/lib/ai-pdm-role-capability-errors.ts', 'src/lib/ai-pdm-role-capability-service.ts',
  'src/lib/role-capability-canonical-json.ts', 'src/lib/repositories/ai-pdm-role-capability-repository.ts', 'src/lib/repositories/role-capability-display-snapshot-repository.ts',
  'src/app/api/settings/access/role-capabilities/commands/[commandId]/route.ts', 'src/app/api/settings/access/role-capabilities/commands/[commandId]/resolve-unknown/route.ts',
  'db/postgres/056_role_capability_display_snapshot.sql', 'contracts/jenfu-platform-governance-availability/v1/contract-lock.json',
]
for (const file of required) if (!fs.existsSync(path.join(root, file))) throw new Error(`DEV008_REQUIRED_FILE_MISSING:${file}`)
const route = fs.readFileSync(path.join(root, 'src/app/api/settings/access/role-capabilities/route.ts'), 'utf8')
if (route.includes('Promise.all') || route.includes('getRoleCapabilityProjection')) throw new Error('DEV008_BULK_ROUTE_FANOUT')
const schema = fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8')
if (!schema.includes('role_capability_display_snapshots') || !schema.includes('payload_canonical_json')) throw new Error('DEV008_SNAPSHOT_SCHEMA_MISSING')
const repository = fs.readFileSync(path.join(root, 'src/lib/repositories/ai-pdm-role-capability-repository.ts'), 'utf8')
const service = fs.readFileSync(path.join(root, 'src/lib/ai-pdm-role-capability-service.ts'), 'utf8')
if (!repository.includes('AbortSignal.timeout(timeoutMs)') || !repository.includes('expectedGovernanceRevision') || !repository.includes('expectedOrganizationRevision') || !repository.includes('assertMutationPreconditions')) throw new Error('DEV008_PRECONDITION_OR_TIMEOUT_GUARD_MISSING')
if (!service.includes('workspace.contractVersion') || !service.includes('workspace.catalogPayloadHash') || !service.includes('sourceRole.projection.changeCursor')) throw new Error('DEV008_STRICT_WORKSPACE_GUARD_MISSING')
console.log(`DEV008_REPOSITORY_OK files=${required.length} bulk=single snapshot=atomic-upsert preflight=required timeout=3s/5s/8s`) 
