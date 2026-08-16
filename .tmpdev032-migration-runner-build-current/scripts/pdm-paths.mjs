import path from "node:path";

export function resolveConfiguredPath(root, configuredValue, fallbackPath) {
  const configured = configuredValue?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
  }
  return path.isAbsolute(fallbackPath) ? fallbackPath : path.resolve(root, fallbackPath);
}

export function getDataDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_DATA_DIR, "data");
}

export function getRepositoryDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_REPOSITORY_DIR, path.join(getDataDir(root, env), "repository"));
}

export function getBackupDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_BACKUP_DIR, path.join(getDataDir(root, env), "backups"));
}

export function getQualityDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_QUALITY_DIR, path.join(getDataDir(root, env), "quality"));
}

export function getEvidenceRoot(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_EVIDENCE_DIR, getDataDir(root, env));
}

export function getReportRoot(root = process.cwd(), reportName, env = process.env) {
  const reportBase = resolveConfiguredPath(root, env.PDM_REPORT_DIR, getEvidenceRoot(root, env));
  return path.join(reportBase, reportName);
}

export function getRestoreDrillsDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_RESTORE_DRILL_DIR, path.join(getEvidenceRoot(root, env), "restore-drills"));
}

export function getRestoreTargetsDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_RESTORE_TARGET_DIR, path.join(getEvidenceRoot(root, env), "restore-targets"));
}

export function getRetentionDrillsDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_RETENTION_DRILL_DIR, path.join(getEvidenceRoot(root, env), "retention-drills"));
}

export function getRestoreHandoffsDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_RESTORE_HANDOFF_DIR, path.join(getEvidenceRoot(root, env), "restore-handoffs"));
}

export function getFieldTestHandoffsDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_FIELD_TEST_HANDOFF_DIR, path.join(getEvidenceRoot(root, env), "field-test-handoffs"));
}

export function getPostgresShadowHandoffsDir(root = process.cwd(), env = process.env) {
  return resolveConfiguredPath(root, env.PDM_POSTGRES_SHADOW_HANDOFF_DIR, path.join(getEvidenceRoot(root, env), "postgres-shadow-handoffs"));
}

export function resolveUserPath(root, value) {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}
