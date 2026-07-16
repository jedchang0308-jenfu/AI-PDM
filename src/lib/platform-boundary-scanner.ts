export interface SourceEntry {
  path: string;
  source: string;
}

export function scanForbiddenFirebaseAuthorities(entries: SourceEntry[]) {
  const patterns = [
    /(?:firebase(?:-admin)?\/firestore|@google-cloud\/firestore|getFirestore\s*\()/iu,
    /(?:firebase(?:-admin)?\/storage|firebase[ _-]storage|getStorage\s*\(\s*getApp)/iu,
    /(?:firebase-functions|firebase\/functions|httpsCallable\s*\(|onCall\s*\()/iu,
    /(?:onDocument(?:Created|Updated|Deleted|Written)?\s*\(|firestore[ _-]trigger)/iu
  ];
  return entries.flatMap((entry) => {
    if (entry.path.replaceAll("\\", "/").endsWith("/platform-boundary-scanner.ts")) return [];
    return patterns.some((pattern) => pattern.test(entry.source)) ? [entry.path] : [];
  });
}

export function scanOperationalRepositories(entries: SourceEntry[]) {
  const violations: string[] = [];
  for (const entry of entries) {
    const normalized = entry.path.replaceAll("\\", "/");
    if (!/^src\/lib\/repositories\/.*-async-repository\.ts$/u.test(normalized)) continue;
    if (!entry.source.includes("AsyncDatabaseClient")) violations.push(`${entry.path}:missing-async-db-port`);
    if (/from\s+["']@\/lib\/db["']/u.test(entry.source)) violations.push(`${entry.path}:direct-sqlite-import`);
    if (/(?:@supabase\/|firebase\/firestore|@google-cloud\/firestore)/u.test(entry.source)) violations.push(`${entry.path}:provider-sdk-import`);
  }
  return violations;
}

export function scanPortableHttpTransports(entries: SourceEntry[]) {
  const violations: string[] = [];
  for (const entry of entries) {
    const normalized = entry.path.replaceAll("\\", "/");
    const isTransport = /^src\/app\/.*route\.ts$/u.test(normalized) || /^src\/(?:middleware|proxy)\.ts$/u.test(normalized);
    if (!isTransport) continue;
    if (/from\s+["']@\/lib\/db["']/u.test(entry.source)) violations.push(`${entry.path}:direct-db-import`);
    if (/\.prepare\s*\(|\.(?:query|execute)\s*\(\s*[`"']\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)/iu.test(entry.source)) {
      violations.push(`${entry.path}:inline-sql`);
    }
    if (/(?:firebase\/firestore|firebase\/storage|firebase\/functions|@supabase\/supabase-js)/u.test(entry.source)) {
      violations.push(`${entry.path}:provider-protocol`);
    }
  }
  return violations;
}

export function validateFormalAuthorityPolicy(policy: {
  database: { productionAuthority: string; requiredPort: string; legacySQLiteProductionAllowed: boolean; browserDatabaseAccessAllowed: boolean };
  files: { productionAuthority: string; currentProductionSliceFileWorkflowsEnabled: boolean; firebaseStorageAllowed: boolean; sharedDriveAuthorityAllowed: boolean };
  transport: { protocol: string; routeDatabaseQueriesAllowed: boolean; routeProviderSdkCallsAllowed: boolean };
}) {
  const errors: string[] = [];
  if (policy.database.productionAuthority !== "cloud_sql_postgres" || policy.database.requiredPort !== "AsyncDatabaseClient") errors.push("AUTHORITY_DATABASE_INVALID");
  if (policy.database.legacySQLiteProductionAllowed || policy.database.browserDatabaseAccessAllowed) errors.push("AUTHORITY_DATABASE_BYPASS_ALLOWED");
  if (policy.files.productionAuthority !== "google_cloud_storage" || policy.files.firebaseStorageAllowed || policy.files.sharedDriveAuthorityAllowed) errors.push("AUTHORITY_FILES_INVALID");
  if (policy.transport.protocol !== "standard-http-bff" || policy.transport.routeDatabaseQueriesAllowed || policy.transport.routeProviderSdkCallsAllowed) errors.push("AUTHORITY_TRANSPORT_INVALID");
  return { valid: errors.length === 0, errors };
}
