export type ReprovisionLoginMethod = "google_workspace" | "firebase_email_password_link";

export interface AccountReprovisionRecord {
  sourceLegacyUserId: string;
  sourceActorArchiveRef: string;
  targetPdmUserId: string;
  targetFirebaseUid: string;
  email: string;
  companyId: string;
  role: string;
  loginMethod: ReprovisionLoginMethod;
  credentialBootstrap: "google-federation" | "firebase-password-setup-link";
}

export interface AccountReprovisionManifest {
  schemaVersion: 1;
  sourceArchiveReadOnly: boolean;
  sameEmailAutoLinkAllowed: false;
  records: AccountReprovisionRecord[];
}

export interface AccountReprovisionValidation {
  valid: boolean;
  errors: string[];
  collisions: Array<{ field: "email" | "targetPdmUserId" | "targetFirebaseUid"; value: string; recordIndexes: number[] }>;
}

function duplicates(values: string[]) {
  const indexes = new Map<string, number[]>();
  values.forEach((value, index) => indexes.set(value, [...(indexes.get(value) ?? []), index]));
  return [...indexes.entries()].filter(([, recordIndexes]) => recordIndexes.length > 1);
}

export function validateAccountReprovisionManifest(manifest: AccountReprovisionManifest): AccountReprovisionValidation {
  const errors: string[] = [];
  const collisions: AccountReprovisionValidation["collisions"] = [];
  if (manifest.schemaVersion !== 1) errors.push("REPROVISION_SCHEMA_VERSION_INVALID");
  if (!manifest.sourceArchiveReadOnly) errors.push("REPROVISION_SOURCE_ARCHIVE_NOT_READ_ONLY");
  if (manifest.sameEmailAutoLinkAllowed !== false) errors.push("REPROVISION_SAME_EMAIL_AUTOLINK_FORBIDDEN");
  if (manifest.records.length === 0) errors.push("REPROVISION_RECORD_REQUIRED");

  for (const [index, record] of manifest.records.entries()) {
    const email = record.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) errors.push(`REPROVISION_EMAIL_INVALID:${index}`);
    if (!record.sourceActorArchiveRef.trim()) errors.push(`REPROVISION_ARCHIVE_REF_REQUIRED:${index}`);
    if (record.sourceLegacyUserId === record.targetPdmUserId || record.sourceLegacyUserId === record.targetFirebaseUid) {
      errors.push(`REPROVISION_LEGACY_ID_REUSE:${index}`);
    }
    if (record.loginMethod === "google_workspace" && record.credentialBootstrap !== "google-federation") {
      errors.push(`REPROVISION_GOOGLE_BOOTSTRAP_INVALID:${index}`);
    }
    if (record.loginMethod === "firebase_email_password_link" && record.credentialBootstrap !== "firebase-password-setup-link") {
      errors.push(`REPROVISION_PASSWORD_BOOTSTRAP_INVALID:${index}`);
    }
  }

  const collisionFields: Array<[AccountReprovisionValidation["collisions"][number]["field"], string[]]> = [
    ["email", manifest.records.map((record) => record.email.trim().toLowerCase())],
    ["targetPdmUserId", manifest.records.map((record) => record.targetPdmUserId)],
    ["targetFirebaseUid", manifest.records.map((record) => record.targetFirebaseUid)]
  ];
  for (const [field, values] of collisionFields) {
    for (const [value, recordIndexes] of duplicates(values)) collisions.push({ field, value, recordIndexes });
  }
  if (collisions.length > 0) errors.push("REPROVISION_COLLISIONS_PRESENT");
  return { valid: errors.length === 0, errors, collisions };
}

export function scanLegacyLoginClosure(input: {
  enabledLoginMethods: string[];
  enabledRoutes: string[];
  demoBootstrapEnabled: boolean;
}) {
  const forbiddenMethods = new Set(["local_password", "supabase_auth", "demo"]);
  const methodViolations = input.enabledLoginMethods.filter((method) => forbiddenMethods.has(method));
  const routeViolations = input.enabledRoutes.filter((route) => /(?:demo-login|local-login|supabase\/auth)/iu.test(route));
  if (input.demoBootstrapEnabled) methodViolations.push("demo_bootstrap");
  return {
    closed: methodViolations.length === 0 && routeViolations.length === 0,
    methodViolations,
    routeViolations
  };
}
