import path from "node:path";

export function resolveNumberingQcDataDir(root = process.cwd(), env = process.env) {
  const configured = env.PDM_DATA_DIR?.trim();
  return configured ? (path.isAbsolute(configured) ? configured : path.resolve(root, configured)) : path.join(root, "data");
}
export function resolveNumberingQcDbPath(root = process.cwd(), env = process.env) {
  return path.join(resolveNumberingQcDataDir(root, env), "ai-pdm.sqlite");
}

export function resolveProtectedNumberingRuntimeDbPath(root = process.cwd()) {
  return path.join(root, "data", "ai-pdm.sqlite");
}

function normalizeForCompare(value) {
  return path.resolve(value).replace(/[\\/]+$/u, "").toLowerCase();
}

export function isProtectedNumberingRuntimeDbPath(dbPath, root = process.cwd()) {
  return normalizeForCompare(dbPath) === normalizeForCompare(resolveProtectedNumberingRuntimeDbPath(root));
}

export function assertNumberingQcRuntimeIsIsolated({ scriptName = "numbering QC", root = process.cwd(), env = process.env } = {}) {
  const provider = (env.PDM_DB_PROVIDER ?? "sqlite").trim().toLowerCase();
  if (provider !== "sqlite") {
    throw new Error(
      [
        `${scriptName} is blocked: allocating numbering QC must not run against a non-SQLite or live runtime provider.`,
        `Observed PDM_DB_PROVIDER=${provider}. Use a disposable SQLite PDM_DATA_DIR for this QC.`
      ].join(" ")
    );
  }

  const dbPath = resolveNumberingQcDbPath(root, env);
  const protectedDbPath = resolveProtectedNumberingRuntimeDbPath(root);
  if (isProtectedNumberingRuntimeDbPath(dbPath, root)) {
    throw new Error(
      [
        `${scriptName} is blocked: allocating numbering QC would use protected runtime DB ${protectedDbPath}.`,
        "Run this QC with a disposable PDM_DATA_DIR and a server started against the same isolated directory.",
        "Read-only sequence integrity reporting is the only allowed operation against the protected runtime DB."
      ].join(" ")
    );
  }

  return { dbPath, dataDir: path.dirname(dbPath), protectedDbPath };
}
