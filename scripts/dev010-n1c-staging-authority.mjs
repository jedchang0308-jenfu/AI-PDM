#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const authorityPath = path.join(root, 'config', 'platform', 'staging-authority.json')

function exactKeys(value, expected, code) {
  const actual = Object.keys(value ?? {}).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(code)
}

export function validateStagingAuthority(config) {
  exactKeys(config, ['activeAuthority', 'legacyEntryTransition', 'legacyRollbackAuthority', 'safety', 'schemaVersion', 'status'], 'DEV010_N1C_STAGING_AUTHORITY_KEYS_INVALID')
  if (config.schemaVersion !== 'jenfu.ai-pdm.staging-authority.v1' || config.status !== 'active') throw new Error('DEV010_N1C_STAGING_AUTHORITY_VERSION_OR_STATUS_INVALID')
  exactKeys(config.activeAuthority, ['canonicalOrigin', 'cloudRunRegion', 'cloudRunRevision', 'cloudRunService', 'cloudSqlDatabase', 'cloudSqlInstance', 'firebaseProjectId', 'hostingSite', 'projectId'], 'DEV010_N1C_ACTIVE_AUTHORITY_KEYS_INVALID')
  exactKeys(config.legacyRollbackAuthority, ['cloudRunRegion', 'cloudRunRevision', 'cloudRunService', 'cloudSqlDatabase', 'cloudSqlInstance', 'hostingSite', 'hostingVersion', 'origin', 'projectId', 'retention'], 'DEV010_N1C_LEGACY_AUTHORITY_KEYS_INVALID')
  exactKeys(config.legacyEntryTransition, ['pathPattern', 'sourceOrigin', 'statusCode', 'strategy', 'targetOrigin'], 'DEV010_N1C_ENTRY_TRANSITION_KEYS_INVALID')
  exactKeys(config.safety, ['billingUnlinkAllowed', 'legacyDatabaseMutationAllowed', 'legacyRuntimeDeletionAllowed', 'legacySecretDeletionAllowed', 'productionWritesAllowed', 'projectDeletionAllowed'], 'DEV010_N1C_AUTHORITY_SAFETY_KEYS_INVALID')

  const active = config.activeAuthority
  const legacy = config.legacyRollbackAuthority
  if (active.projectId !== 'jenfu-platform-nonprod' || active.firebaseProjectId !== active.projectId || active.hostingSite !== 'jenfu-platform-nonprod-pdm' || active.canonicalOrigin !== 'https://jenfu-platform-nonprod-pdm.web.app' || active.cloudRunService !== 'ai-pdm-stg' || active.cloudRunRegion !== 'asia-east1' || active.cloudSqlInstance !== 'jenfu-platform-nonprod-pg' || active.cloudSqlDatabase !== 'jenfu_stg') throw new Error('DEV010_N1C_ACTIVE_AUTHORITY_TARGET_INVALID')
  if (!/^ai-pdm-stg-[0-9]{5}-[a-z0-9]{3}$/u.test(active.cloudRunRevision)) throw new Error('DEV010_N1C_ACTIVE_AUTHORITY_REVISION_INVALID')
  if (legacy.projectId !== 'jenfu-ai-pdm-stg-361825' || legacy.hostingSite !== legacy.projectId || legacy.origin !== `https://${legacy.hostingSite}.web.app` || legacy.hostingVersion !== '9dbedce99ef162c9' || legacy.cloudRunService !== 'ai-pdm-stg' || legacy.cloudRunRegion !== 'asia-east1' || legacy.cloudSqlInstance !== 'ai-pdm-stg-postgres' || legacy.cloudSqlDatabase !== 'ai_pdm' || legacy.retention !== 'retained-for-explicit-rollback-approval') throw new Error('DEV010_N1C_LEGACY_ROLLBACK_TARGET_INVALID')
  const transition = config.legacyEntryTransition
  if (transition.strategy !== 'firebase-hosting-path-preserving-redirect' || transition.statusCode !== 302 || transition.pathPattern !== '/:path*' || transition.sourceOrigin !== legacy.origin || transition.targetOrigin !== active.canonicalOrigin) throw new Error('DEV010_N1C_ENTRY_TRANSITION_INVALID')
  if (Object.values(config.safety).some((allowed) => allowed !== false)) throw new Error('DEV010_N1C_AUTHORITY_SAFETY_RELAXED')
  return config
}

export function loadStagingAuthority() {
  return validateStagingAuthority(JSON.parse(fs.readFileSync(authorityPath, 'utf8')))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadStagingAuthority()
  process.stdout.write(`${JSON.stringify({ status: 'PASS', activeOrigin: config.activeAuthority.canonicalOrigin, legacyOrigin: config.legacyRollbackAuthority.origin, legacyRetained: true, billingUnlinkAllowed: config.safety.billingUnlinkAllowed })}\n`)
}
