export interface CleanProductionSeedManifest {
  schemaVersion: 1;
  fixtureOnly: boolean;
  releaseReady: boolean;
  sameEmailAutoLinkAllowed: boolean;
  sourceArchive: {
    readOnly: boolean;
    sourceActorIdsPreserved: boolean;
    owner: string;
    inventorySha256: string;
    contentSha256: string;
  };
  legacyIdentityIds: string[];
  users: Array<{ id: string; firebaseUid: string; email: string; role: string; companyId: string }>;
  companies: Array<{ id: string }>;
  roles: Array<{ code: string; minimum: boolean }>;
  configuration: Array<{ key: string; value: string }>;
  numberingSequences: Array<{ companyId: string; sequenceKey: string; nextValue: number }>;
  historicalOfficialNumbers: Array<{ companyId: string; numberKind: string; numberValue: string }>;
  numberingRecoveryReservations: Array<{
    companyId: string;
    numberKind: string;
    numberValue: string;
    sourceArchiveRef: string;
    ledgerEntryHash: string;
  }>;
  excludedRows: Record<string, unknown[]>;
}

function recordKey(input: { companyId: string; numberKind: string; numberValue: string }) {
  return `${input.companyId}:${input.numberKind}:${input.numberValue}`;
}

export function validateCleanProductionSeed(manifest: CleanProductionSeedManifest, options: { requireReleaseReady?: boolean } = {}) {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push("CLEAN_SEED_SCHEMA_VERSION_INVALID");
  if (!manifest.sourceArchive.readOnly) errors.push("CLEAN_SEED_SOURCE_ARCHIVE_NOT_READ_ONLY");
  if (!manifest.sourceArchive.sourceActorIdsPreserved) errors.push("CLEAN_SEED_SOURCE_ACTORS_NOT_PRESERVED");
  if (!manifest.sourceArchive.owner.trim()) errors.push("CLEAN_SEED_ARCHIVE_OWNER_REQUIRED");
  if (![manifest.sourceArchive.inventorySha256, manifest.sourceArchive.contentSha256].every((value) => /^[a-f0-9]{64}$/u.test(value))) {
    errors.push("CLEAN_SEED_ARCHIVE_HASH_INVALID");
  }
  if (manifest.sameEmailAutoLinkAllowed) errors.push("CLEAN_SEED_EMAIL_AUTOLINK_FORBIDDEN");
  if (manifest.users.length === 0 || manifest.companies.length === 0 || manifest.roles.length === 0 || manifest.configuration.length === 0 || manifest.numberingSequences.length === 0) {
    errors.push("CLEAN_SEED_MINIMUM_CONFIGURATION_REQUIRED");
  }
  const legacyIds = new Set(manifest.legacyIdentityIds);
  for (const [index, user] of manifest.users.entries()) {
    if (legacyIds.has(user.id) || legacyIds.has(user.firebaseUid)) errors.push(`CLEAN_SEED_LEGACY_ID_REUSED:${index}`);
    if (!user.id.startsWith("prod-") || !user.firebaseUid.startsWith("prod-")) errors.push(`CLEAN_SEED_NEW_PRODUCTION_ID_REQUIRED:${index}`);
  }
  for (const [table, rows] of Object.entries(manifest.excludedRows)) {
    if (!Array.isArray(rows) || rows.length > 0) errors.push(`CLEAN_SEED_EXCLUDED_ROWS_PRESENT:${table}`);
  }
  const historical = new Set(manifest.historicalOfficialNumbers.map(recordKey));
  const reservations = new Set(manifest.numberingRecoveryReservations.map(recordKey));
  if (reservations.size !== manifest.numberingRecoveryReservations.length) errors.push("CLEAN_SEED_DUPLICATE_RESERVATION");
  for (const key of historical) if (!reservations.has(key)) errors.push(`CLEAN_SEED_RESERVATION_MISSING:${key}`);
  for (const [index, reservation] of manifest.numberingRecoveryReservations.entries()) {
    if (!reservation.sourceArchiveRef.trim() || !/^[a-f0-9]{64}$/u.test(reservation.ledgerEntryHash)) errors.push(`CLEAN_SEED_RESERVATION_EVIDENCE_INVALID:${index}`);
  }
  if (options.requireReleaseReady && (manifest.fixtureOnly || !manifest.releaseReady)) errors.push("CLEAN_SEED_RELEASE_EVIDENCE_REQUIRED");
  return { valid: errors.length === 0, errors };
}

export interface DataLocationInventory {
  schemaVersion: 1;
  phase: "phase1-planning" | "staging" | "production";
  reviewOwner: string;
  releaseReady: boolean;
  entries: Array<{
    category: string;
    authority: string;
    location: string;
    placementStatus: "planned" | "provider-managed-exception" | "verified";
    retentionPolicy: string;
    retentionOwner: string;
    containsFormalData: boolean;
    exceptionApproved?: boolean;
  }>;
}

export function validateDataLocationInventory(inventory: DataLocationInventory, options: { requireReleaseReady?: boolean } = {}) {
  const requiredCategories = ["identity", "database", "files", "backups", "runtime", "builds_images", "logs", "secrets_keys", "exports"];
  const errors: string[] = [];
  const byCategory = new Map(inventory.entries.map((entry) => [entry.category, entry]));
  for (const category of requiredCategories) {
    const entry = byCategory.get(category);
    if (!entry) errors.push(`LOCATION_CATEGORY_MISSING:${category}`);
    else if (![entry.authority, entry.location, entry.retentionPolicy, entry.retentionOwner].every((value) => value.trim())) errors.push(`LOCATION_ENTRY_INCOMPLETE:${category}`);
  }
  for (const entry of inventory.entries) {
    if (entry.placementStatus === "provider-managed-exception" && !entry.exceptionApproved) errors.push(`LOCATION_EXCEPTION_NOT_APPROVED:${entry.category}`);
  }
  if (byCategory.get("database")?.location !== "asia-east1") errors.push("LOCATION_DATABASE_NOT_TAIWAN");
  if (byCategory.get("files")?.location !== "asia-east1") errors.push("LOCATION_FILES_NOT_TAIWAN");
  if (!byCategory.get("identity")?.location.includes("US")) errors.push("LOCATION_FIREBASE_US_EXCEPTION_MISSING");
  if (!byCategory.get("logs")?.location.includes("global")) errors.push("LOCATION_GLOBAL_REQUIRED_LOG_EXCEPTION_MISSING");
  if (options.requireReleaseReady && (!inventory.releaseReady || inventory.entries.some((entry) => entry.placementStatus !== "verified" && entry.category !== "identity" && entry.category !== "logs" && entry.category !== "exports"))) {
    errors.push("LOCATION_RELEASE_EVIDENCE_REQUIRED");
  }
  return { valid: errors.length === 0, errors };
}

export interface CostBudgetPolicy {
  schemaVersion: 1;
  planningEstimateOnly: boolean;
  costOwner: string;
  businessOwner: string;
  monthlyBudget: number;
  planReviewStopAtUsd: number;
  monthlyAssumptions: Array<{ service: string; amount: number; basis: string }>;
  alerts: Array<{ threshold: number; recipients: string[] }>;
  varianceEscalation: { monthlyVarianceRatio: number; owner: string; decisionDueBusinessDays: number };
  automaticBillingDisableAllowed: boolean;
  releaseReady: boolean;
}

export function validateCostBudgetPolicy(policy: CostBudgetPolicy, options: { requireReleaseReady?: boolean } = {}) {
  const errors: string[] = [];
  if (!policy.costOwner.trim() || !policy.businessOwner.trim()) errors.push("COST_OWNER_REQUIRED");
  if (policy.planReviewStopAtUsd <= 0 || policy.planReviewStopAtUsd > policy.monthlyBudget * 0.8) errors.push("COST_PLAN_REVIEW_STOP_INVALID");
  const assumptionTotal = policy.monthlyAssumptions.reduce((sum, item) => sum + item.amount, 0);
  if (assumptionTotal !== policy.monthlyBudget) errors.push("COST_MONTHLY_ASSUMPTIONS_DO_NOT_MATCH_BUDGET");
  const thresholds = policy.alerts.map((alert) => alert.threshold).sort((a, b) => a - b);
  if (thresholds.join(",") !== "0.5,0.8,1") errors.push("COST_ALERT_THRESHOLDS_MUST_BE_50_80_100");
  if (policy.alerts.some((alert) => alert.recipients.length === 0)) errors.push("COST_ALERT_RECIPIENT_REQUIRED");
  if (policy.varianceEscalation.monthlyVarianceRatio <= 0 || !policy.varianceEscalation.owner.trim() || policy.varianceEscalation.decisionDueBusinessDays <= 0) {
    errors.push("COST_VARIANCE_ESCALATION_INVALID");
  }
  if (policy.automaticBillingDisableAllowed) errors.push("COST_AUTOMATIC_BILLING_DISABLE_FORBIDDEN");
  if (options.requireReleaseReady && (policy.planningEstimateOnly || !policy.releaseReady)) errors.push("COST_MEASURED_RELEASE_EVIDENCE_REQUIRED");
  return { valid: errors.length === 0, errors, assumptionTotal };
}

export interface SupportContinuityPolicy {
  timezone: "Asia/Taipei";
  businessHours: { weekdays: number[]; start: "08:00"; end: "17:00" };
  companyHolidays: string[];
  rpoWallClockMinutes: number;
  rtoBusinessMinutes: number;
  allHoursAcknowledgementMinutes: number;
  containmentStartMinutesAfterAcknowledgement: number;
  roster: { primary: string; backup: string };
  containmentChecklist: string[];
  regionalDrClaimAllowed: boolean;
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function businessMinutesBetween(startIso: string, endIso: string, policy: SupportContinuityPolicy) {
  if (policy.timezone !== "Asia/Taipei" || policy.businessHours.start !== "08:00" || policy.businessHours.end !== "17:00") {
    throw new Error("CONTINUITY_CALENDAR_CONTRACT_INVALID");
  }
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("CONTINUITY_TIMESTAMP_INVALID");
  const holidays = new Set(policy.companyHolidays);
  const firstLocal = new Date(start + TAIPEI_OFFSET_MS);
  const lastLocal = new Date(end + TAIPEI_OFFSET_MS);
  let day = Date.UTC(firstLocal.getUTCFullYear(), firstLocal.getUTCMonth(), firstLocal.getUTCDate());
  const lastDay = Date.UTC(lastLocal.getUTCFullYear(), lastLocal.getUTCMonth(), lastLocal.getUTCDate());
  let totalMs = 0;
  while (day <= lastDay) {
    const localDay = new Date(day);
    const dateKey = localDay.toISOString().slice(0, 10);
    if (policy.businessHours.weekdays.includes(localDay.getUTCDay()) && !holidays.has(dateKey)) {
      const dayStartUtc = day - TAIPEI_OFFSET_MS + 8 * 60 * 60 * 1000;
      const dayEndUtc = day - TAIPEI_OFFSET_MS + 17 * 60 * 60 * 1000;
      totalMs += Math.max(0, Math.min(end, dayEndUtc) - Math.max(start, dayStartUtc));
    }
    day += 24 * 60 * 60 * 1000;
  }
  return totalMs / 60_000;
}

export function evaluateContinuityIncident(input: {
  policy: SupportContinuityPolicy;
  lastRecoverablePointAt: string;
  detectedAt: string;
  acknowledgedAt: string;
  containmentStartedAt: string;
  restoredAt: string;
}) {
  const at = (value: string) => Date.parse(value);
  const rpoMinutes = (at(input.detectedAt) - at(input.lastRecoverablePointAt)) / 60_000;
  const acknowledgementMinutes = (at(input.acknowledgedAt) - at(input.detectedAt)) / 60_000;
  const containmentDelayMinutes = (at(input.containmentStartedAt) - at(input.acknowledgedAt)) / 60_000;
  const rtoBusinessMinutes = businessMinutesBetween(input.detectedAt, input.restoredAt, input.policy);
  const rosterComplete = Boolean(input.policy.roster.primary.trim() && input.policy.roster.backup.trim() && input.policy.roster.primary !== input.policy.roster.backup);
  const errors: string[] = [];
  if (rpoMinutes < 0 || rpoMinutes > input.policy.rpoWallClockMinutes) errors.push("CONTINUITY_RPO_BREACHED");
  if (rtoBusinessMinutes > input.policy.rtoBusinessMinutes) errors.push("CONTINUITY_RTO_BREACHED");
  if (acknowledgementMinutes < 0 || acknowledgementMinutes > input.policy.allHoursAcknowledgementMinutes) errors.push("CONTINUITY_ACK_BREACHED");
  if (containmentDelayMinutes < 0 || containmentDelayMinutes > input.policy.containmentStartMinutesAfterAcknowledgement) errors.push("CONTINUITY_CONTAINMENT_DELAYED");
  if (!rosterComplete || input.policy.containmentChecklist.length < 3) errors.push("CONTINUITY_ROSTER_OR_CHECKLIST_INCOMPLETE");
  if (input.policy.regionalDrClaimAllowed) errors.push("CONTINUITY_REGIONAL_DR_CLAIM_FORBIDDEN");
  return { valid: errors.length === 0, errors, rpoMinutes, rtoBusinessMinutes, acknowledgementMinutes, containmentDelayMinutes };
}

export interface OperationalLogEvent {
  requestId: string;
  actorId: string;
  companyId: string;
  commandName: string;
  databaseInstance: string;
  storageObject: { bucket: string; key: string; generation: string } | null;
  providerOperation: string;
  status: "started" | "succeeded" | "failed";
  occurredAt: string;
}

export function validateOperationalLogEvent(input: OperationalLogEvent & Record<string, unknown>) {
  const allowed = new Set(["requestId", "actorId", "companyId", "commandName", "databaseInstance", "storageObject", "providerOperation", "status", "occurredAt"]);
  const forbiddenFields = Object.keys(input).filter((key) => !allowed.has(key) || /(?:email|password|secret|token|cookie|authorization|payload|bytes)/iu.test(key));
  const stringValues = [input.requestId, input.actorId, input.companyId, input.commandName, input.databaseInstance, input.providerOperation];
  if (input.storageObject) stringValues.push(input.storageObject.bucket, input.storageObject.key, input.storageObject.generation);
  const piiValues = stringValues.filter((value) => /[^\s@]+@[^\s@]+/u.test(value));
  return { valid: forbiddenFields.length === 0 && piiValues.length === 0, forbiddenFields, piiValues };
}
