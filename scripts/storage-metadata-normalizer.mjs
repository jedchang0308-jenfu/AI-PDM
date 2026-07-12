import path from "node:path";
import { resolveConfiguredPath } from "./pdm-paths.mjs";

export function normalizeStorageMetadataRows(rows, options) {
  const repositoryDir = options.repositoryDir;
  const releasePackageRoot = options.releasePackageRoot;
  const root = options.root;
  const objects = [];

  for (const row of rows.submissionFiles ?? []) {
    const provider = normalizeProvider(row.storage_provider ?? inferProviderFromPointer(row.local_path));
    const parsedPointer = parseStoragePointer(row.local_path);
    objects.push({
      id: row.id,
      source: "submission_files",
      provider,
      bucket: row.storage_bucket ?? parsedPointer?.bucket ?? null,
      lifecycleTier: inferSubmissionLifecycleTier(row.submission_status),
      businessStatus: row.submission_status ?? "unknown",
      linkedEntityType: "submission",
      linkedEntityId: row.submission_id,
      filename: row.original_filename,
      extension: normalizeExtension(row.original_filename),
      fileRole: row.file_role,
      bytes: normalizeBytes(row.file_size),
      hash: normalizeHash(row.sha256),
      hashAlgorithm: "SHA-256",
      storageKey: row.storage_key ?? parsedPointer?.key ?? safeRelative(repositoryDir, row.local_path),
      localPath: row.local_path,
      pathForExistenceCheck: row.local_path,
      localRoot: repositoryDir,
      createdAt: row.created_at
    });
  }

  for (const row of rows.releasePackages ?? []) {
    const provider = normalizeProvider(row.storage_provider ?? inferProviderFromPointer(row.local_path));
    const parsedPointer = parseStoragePointer(row.local_path);
    objects.push({
      id: row.id,
      source: "release_packages",
      provider,
      bucket: row.storage_bucket ?? parsedPointer?.bucket ?? null,
      lifecycleTier: "hot",
      businessStatus: "ReleasedPackage",
      linkedEntityType: "submission",
      linkedEntityId: row.submission_id,
      filename: row.package_filename,
      extension: normalizeExtension(row.package_filename),
      fileRole: "release_package",
      bytes: normalizeBytes(row.file_size),
      hash: normalizeHash(row.sha256),
      hashAlgorithm: "SHA-256",
      storageKey: row.storage_key ?? parsedPointer?.key ?? safeRelative(releasePackageRoot, row.local_path),
      localPath: row.local_path,
      pathForExistenceCheck: row.local_path,
      localRoot: releasePackageRoot,
      createdAt: row.created_at
    });
  }

  for (const row of rows.fileAssets ?? []) {
    const originalPath = row.original_path ? resolveConfiguredPath(root, row.original_path, row.original_path) : null;
    objects.push({
      id: row.id,
      source: "file_assets",
      provider: normalizeProvider(row.storage_provider),
      lifecycleTier: row.deleted_at ? "cold" : "hot",
      businessStatus: row.deleted_at ? "Deleted" : row.sync_status ?? "unknown",
      linkedEntityType: row.linked_entity_type,
      linkedEntityId: row.linked_entity_id,
      filename: row.file_name,
      extension: normalizeExtension(row.file_ext || row.file_name),
      mimeType: row.mime_type ?? null,
      fileRole: row.document_category ?? "asset",
      bytes: normalizeBytes(row.file_size),
      hash: normalizeHash(row.content_hash),
      hashAlgorithm: normalizeHashAlgorithm(row.hash_algorithm),
      storageKey: row.storage_key ?? safeRelative(repositoryDir, originalPath),
      localPath: originalPath,
      pathForExistenceCheck: originalPath,
      localRoot: repositoryDir,
      createdAt: row.created_at
    });
  }

  return objects;
}

export function safeRelative(root, targetPath) {
  if (!root || !targetPath) return null;
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) return relative.split(path.sep).join("/");
  return `[external]/${path.basename(targetPath)}`;
}

export function normalizeExtension(filenameOrExt) {
  const raw = String(filenameOrExt ?? "");
  const ext = raw.startsWith(".") ? raw : path.extname(raw);
  return (ext || "[none]").toLowerCase();
}

function normalizeProvider(provider) {
  const value = String(provider ?? "").trim();
  if (value === "j_drive") return "local_repository";
  if (value === "local") return "local_repository";
  return value || "unknown";
}

function inferProviderFromPointer(value) {
  const text = String(value ?? "");
  if (text.startsWith("supabase://")) return "supabase_storage";
  if (text.startsWith("s3-compatible://")) return "s3_compatible";
  return "local_repository";
}

function parseStoragePointer(value) {
  const text = String(value ?? "");
  const prefix = text.startsWith("supabase://") ? "supabase://" : text.startsWith("s3-compatible://") ? "s3-compatible://" : "";
  if (!prefix) return null;
  const rest = text.slice(prefix.length);
  const separatorIndex = rest.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === rest.length - 1) return null;
  return {
    bucket: rest.slice(0, separatorIndex),
    key: rest.slice(separatorIndex + 1).replaceAll("\\", "/")
  };
}

function normalizeBytes(value) {
  const bytes = Number(value ?? 0);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}

function normalizeHash(hash) {
  const value = String(hash ?? "").trim().toLowerCase();
  return value || null;
}

function normalizeHashAlgorithm(value) {
  const algorithm = String(value ?? "").trim().toUpperCase();
  return algorithm || null;
}

function inferSubmissionLifecycleTier(status) {
  if (status === "Released" || status === "Obsolete") return "hot";
  return "hot";
}
