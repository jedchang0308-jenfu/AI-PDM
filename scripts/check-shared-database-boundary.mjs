import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const RULESET = 'DEV010_DB_RULESET_V1'
const ALL_CORE_SCHEMAS = ['platform_core', 'orgmaster_core', 'ai_pdm_core']

const PROJECTS = {
  'jenfu-management-system': {
    app: 'platform',
    migrationDir: 'db/migrations',
    firstGovernedVersion: 5,
    ownedSchemas: ['platform_core', 'platform_contract'],
  },
  'orgmaster-canvas': {
    app: 'orgmaster',
    migrationDir: 'db/migrations',
    firstGovernedVersion: 11,
    ownedSchemas: ['orgmaster_core', 'orgmaster_contract'],
  },
  'ai-pdm': {
    app: 'ai-pdm',
    migrationDir: 'db/postgres',
    firstGovernedVersion: 63,
    ownedSchemas: ['ai_pdm_core', 'ai_pdm_contract'],
  },
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

function readProjectConfig(root) {
  const packagePath = path.join(root, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  const config = PROJECTS[packageJson.name]
  if (!config) throw new Error(`${RULESET}: unsupported package ${packageJson.name ?? '<missing>'}`)
  return config
}

function normalizeRepoPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '')
}

function migrationVersion(filePath) {
  const match = path.basename(filePath).match(/^(\d{3})_.+\.sql$/u)
  return match ? Number(match[1]) : null
}

function parseHeader(sql) {
  const header = sql.split(/\r?\n/u).slice(0, 20).join('\n')
  const field = (name) => header.match(new RegExp(`^-- ${name}:\\s*(.+?)\\s*$`, 'mu'))?.[1] ?? null
  return {
    marker: /^-- DB-CHANGE\s*$/mu.test(header),
    owner: field('owner'),
    schemas: field('schemas')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [],
    contractImpact: field('contract-impact'),
    compatibility: field('compatibility'),
    governanceReview: field('governance-review'),
  }
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/--[^\r\n]*/gu, ' ')
}

function validateSql(sql, filePath, config) {
  const errors = []
  const warnings = []
  const header = parseHeader(sql)
  const label = normalizeRepoPath(filePath)

  if (!header.marker) errors.push(`${label}: missing -- DB-CHANGE marker in the first 20 lines`)
  if (header.owner !== config.app) errors.push(`${label}: owner must be ${config.app}`)
  if (header.schemas.length === 0) errors.push(`${label}: schemas must list at least one owned schema`)

  for (const schema of header.schemas) {
    if (!config.ownedSchemas.includes(schema)) {
      errors.push(`${label}: schema ${schema} is outside this repository's ownership boundary`)
    }
  }

  if (!header.contractImpact) errors.push(`${label}: contract-impact is required`)
  if (!['backward-compatible', 'additive', 'new-version'].includes(header.compatibility)) {
    errors.push(`${label}: compatibility must be backward-compatible, additive, or new-version`)
  }

  const executableSql = stripSqlComments(sql)
  const foreignCoreSchemas = ALL_CORE_SCHEMAS.filter((schema) => !config.ownedSchemas.includes(schema))

  for (const schema of config.ownedSchemas) {
    const referenced = new RegExp(`(?:"${schema}"|${schema})\\s*\\.`, 'iu').test(executableSql)
    if (referenced && !header.schemas.includes(schema)) {
      errors.push(`${label}: header schemas must include referenced schema ${schema}`)
    }
  }

  const ownedContract = config.ownedSchemas.find((schema) => schema.endsWith('_contract'))
  const touchesOwnedContract = ownedContract
    ? new RegExp(`(?:"${ownedContract}"|${ownedContract})\\s*\\.`, 'iu').test(executableSql)
    : false
  if (touchesOwnedContract && header.contractImpact === 'none') {
    errors.push(`${label}: contract-impact cannot be none when ${ownedContract} is referenced`)
  }

  for (const schema of foreignCoreSchemas) {
    if (new RegExp(`(?:"${schema}"|${schema})\\s*\\.`, 'iu').test(executableSql)) {
      errors.push(`${label}: direct reference to private schema ${schema} is forbidden; use a versioned contract`)
    }
  }

  if (/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|SEQUENCE|TYPE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"|public)\s*\./iu.test(executableSql)) {
    errors.push(`${label}: application-owned objects must not be created in public`)
  }

  if (/\bGRANT\s+(?:ALL(?:\s+PRIVILEGES)?|CREATE)\b[\s\S]{0,500}?\bTO\s+(?:GROUP\s+)?(?:"?[\w@.-]*runtime[\w@.-]*"?|jenfu_(?:platform|orgmaster|ai_pdm)_runtime)\b/iu.test(executableSql)) {
    errors.push(`${label}: runtime identities must not receive ALL or CREATE privileges`)
  }

  if (/\bOWNER\s+TO\s+"?(?:jenfu_(?:platform|orgmaster|ai_pdm)_runtime|[\w@.-]*runtime[\w@.-]*)"?/iu.test(executableSql)) {
    errors.push(`${label}: runtime identities must not own database objects`)
  }

  if (/\bGRANT\s+jenfu_(?:platform|orgmaster|ai_pdm)_migrator\s+TO\s+"?[\w@.-]*runtime[\w@.-]*"?/iu.test(executableSql)) {
    errors.push(`${label}: runtime identities must not receive migrator membership`)
  }

  const statements = executableSql.split(';').map((value) => value.trim()).filter(Boolean)
  const destructiveContract = statements.some((statement) => {
    const touchesContract = /(?:"(?:platform|orgmaster|ai_pdm)_contract"|(?:platform|orgmaster|ai_pdm)_contract)(?:\s*\.|\s|$)/iu.test(statement)
    const dropsObject = /\bDROP\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|TYPE|SCHEMA)\b/iu.test(statement)
    const destructiveAlter = /\bALTER\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\b[\s\S]*?\b(?:DROP\s+COLUMN|RENAME\s+(?:COLUMN|TO)|ALTER\s+COLUMN)\b/iu.test(statement)
    return touchesContract && (dropsObject || destructiveAlter)
  })

  const reviewRecorded = /^(?:DEV|ADR)-\d{3}$/u.test(header.governanceReview ?? '')
  if (destructiveContract && !reviewRecorded) {
    errors.push(`${label}: destructive contract change requires a new version or governance-review: DEV-NNN / ADR-NNN`)
  } else if (destructiveContract) {
    warnings.push(`${label}: destructive contract change references ${header.governanceReview}`)
  }

  if (/\b(?:DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE\s+TABLE)\b/iu.test(executableSql)) {
    warnings.push(`${label}: destructive DDL detected; confirm data disposition and recovery evidence`)
  }

  return { errors, warnings }
}

function gitChangedPaths(root, migrationDir, diffFilter, baseRef) {
  const args = baseRef
    ? ['diff', '--name-only', `--diff-filter=${diffFilter}`, `${baseRef}...HEAD`, '--', migrationDir]
    : ['diff', '--cached', '--name-only', `--diff-filter=${diffFilter}`, '--', migrationDir]
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${RULESET}: git diff failed${baseRef ? ` for base ${baseRef}` : ''}: ${result.stderr.trim()}`)
  }
  return result.stdout.split(/\r?\n/u).map(normalizeRepoPath).filter(Boolean)
}

function runSelfTest(config) {
  const ownCore = config.ownedSchemas[0]
  const ownContract = config.ownedSchemas[1]
  const foreignCore = ALL_CORE_SCHEMAS.find((schema) => !config.ownedSchemas.includes(schema))
  const header = `-- DB-CHANGE\n-- owner: ${config.app}\n-- schemas: ${ownCore}\n-- contract-impact: none\n-- compatibility: backward-compatible\n`
  const cases = [
    { name: 'valid own-core migration', sql: `${header}CREATE TABLE ${ownCore}.future_example(id text PRIMARY KEY);`, errors: false },
    { name: 'missing header', sql: `CREATE TABLE ${ownCore}.future_example(id text PRIMARY KEY);`, errors: true },
    { name: 'foreign core reference', sql: `${header}SELECT * FROM ${foreignCore}.private_table;`, errors: true },
    { name: 'public object', sql: `${header}CREATE TABLE public.future_example(id text);`, errors: true },
    { name: 'runtime privilege escalation', sql: `${header}GRANT ALL ON TABLE ${ownCore}.future_example TO jenfu_platform_runtime;`, errors: true },
    { name: 'undeclared contract impact', sql: `${header.replace(`-- schemas: ${ownCore}`, `-- schemas: ${ownContract}`)}CREATE VIEW ${ownContract}.v_example_v2 AS SELECT 1 AS id;`, errors: true },
    { name: 'unreviewed contract break', sql: `${header.replace(`-- schemas: ${ownCore}`, `-- schemas: ${ownContract}`)}DROP VIEW ${ownContract}.v_example_v1;`, errors: true },
    { name: 'reviewed contract retirement', sql: `${header.replace(`-- schemas: ${ownCore}`, `-- schemas: ${ownContract}`).replace('-- contract-impact: none', `-- contract-impact: ${config.app}.example.v2`).replace('-- compatibility: backward-compatible', '-- compatibility: new-version')}-- governance-review: DEV-010\nDROP VIEW ${ownContract}.v_example_v1;`, errors: false },
  ]

  const failures = cases.filter((testCase, index) => {
    const result = validateSql(testCase.sql, `self-test-${index + 1}.sql`, config)
    return (result.errors.length > 0) !== testCase.errors
  })

  if (failures.length > 0) {
    throw new Error(`${RULESET}: self-test failed: ${failures.map((item) => item.name).join(', ')}`)
  }

  process.stdout.write(`${RULESET} self-test PASS (${cases.length}/${cases.length})\n`)
}

function main() {
  const root = process.cwd()
  const config = readProjectConfig(root)
  if (process.argv.includes('--self-test')) {
    runSelfTest(config)
    return
  }

  const baseArg = process.argv.find((value) => value.startsWith('--base='))
  const baseRef = baseArg?.slice('--base='.length) || process.env.DB_BOUNDARY_BASE_REF || null
  const migrationRoot = path.join(root, ...config.migrationDir.split('/'))
  const files = fs.readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && migrationVersion(entry.name) !== null)
    .map((entry) => normalizeRepoPath(path.posix.join(config.migrationDir, entry.name)))

  const added = gitChangedPaths(root, config.migrationDir, 'A', baseRef)
  const rewritten = gitChangedPaths(root, config.migrationDir, 'MDR', baseRef)
  const errors = []
  const warnings = []

  for (const filePath of rewritten) {
    if (migrationVersion(filePath) !== null) {
      errors.push(`${filePath}: committed migration files are immutable; add a forward migration instead`)
    }
  }

  for (const filePath of added) {
    const version = migrationVersion(filePath)
    if (version !== null && version < config.firstGovernedVersion) {
      errors.push(`${filePath}: version is below the first available governed version ${String(config.firstGovernedVersion).padStart(3, '0')}`)
    }
  }

  const governedFiles = [...new Set([...files.filter((filePath) => migrationVersion(filePath) >= config.firstGovernedVersion), ...added])]
    .filter((filePath) => fs.existsSync(path.join(root, ...filePath.split('/'))))
    .sort()

  for (const filePath of governedFiles) {
    const result = validateSql(fs.readFileSync(path.join(root, ...filePath.split('/')), 'utf8'), filePath, config)
    errors.push(...result.errors)
    warnings.push(...result.warnings)
  }

  for (const warning of [...new Set(warnings)]) process.stderr.write(`WARN ${warning}\n`)
  if (process.argv.includes('--strict-warnings')) errors.push(...warnings.map((warning) => `strict warning: ${warning}`))

  if (errors.length > 0) {
    for (const error of [...new Set(errors)]) fail(`ERROR ${error}`)
    return
  }

  process.stdout.write(`${RULESET} PASS app=${config.app} governedFiles=${governedFiles.length} diffMode=${baseRef ? `base:${baseRef}` : 'staged'}\n`)
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
