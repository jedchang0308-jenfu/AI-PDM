import crypto from "node:crypto";
import type { JenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import type { PrincipalRequestInput } from "@/lib/jenfu-principal-request-guard";

export type PlatformAuthProvider = "current_pdm_session" | "local_password" | "google_oauth" | "future_shared_iam";

export type PlatformActorContext = {
  principalId: string;
  pdmUserId: string;
  organizationId: string;
  platformOrganizationId: string | null;
  roles: string[];
  scopes: string[];
  authProvider: PlatformAuthProvider;
  correlationId: string;
  requestId: string;
  /** In-process verified identity; never serialize this into command/outbox payloads. */
  authorizationActor?: JenfuVerifiedAuthorizationActor;
  /** Local legacy role used only while the selected authority is legacy. */
  legacyRole?: string;
};

export type PdmCommand<TPayload> = {
  commandName: string;
  schemaVersion: number;
  idempotencyKey: string;
  actor: PlatformActorContext;
  payload: TPayload;
};

export type PdmCommandMetadata = {
  actor: PlatformActorContext;
  idempotencyKey: string;
  /** Kept in process for command-time verification; never copied into the persisted command. */
  principalRequest?: PrincipalRequestInput;
  principalAuthorization?: {
    request: Request;
    routePath: string;
    method: string;
    permissionCode: string;
  };
};

const SAFE_CONTEXT_ID = /^[A-Za-z0-9._:/-]{1,200}$/u;

function requiredId(value: string, code: string) {
  const normalized = value.trim();
  if (!SAFE_CONTEXT_ID.test(normalized)) throw new Error(code);
  return normalized;
}

function requiredOpaquePrincipalId(value: string, code: string) {
  if (value.length < 1 || value.length > 255 || !/\S/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(code);
  return value;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function createPlatformActorContext(input: {
  pdmUserId: string;
  organizationId: string;
  roles?: string[];
  scopes?: string[];
  authProvider?: PlatformAuthProvider;
  correlationId?: string;
  requestId?: string;
  principalId?: string;
  platformOrganizationId?: string;
  authorizationActor?: JenfuVerifiedAuthorizationActor;
  legacyRole?: string;
}): PlatformActorContext {
  const pdmUserId = requiredId(input.pdmUserId, "PLATFORM_PDM_USER_ID_REQUIRED");
  const organizationId = requiredId(input.organizationId, "PLATFORM_ORGANIZATION_ID_REQUIRED");
  const requestId = input.requestId ? requiredId(input.requestId, "PLATFORM_REQUEST_ID_INVALID") : crypto.randomUUID();
  const correlationId = input.correlationId
    ? requiredId(input.correlationId, "PLATFORM_CORRELATION_ID_INVALID")
    : requestId;
  const verifiedPrincipalId = input.authorizationActor?.principalId;
  if (verifiedPrincipalId?.startsWith("pdm:")) throw new Error("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
  if (input.authorizationActor && (
    input.authorizationActor.localPrincipalId !== pdmUserId
    || input.authorizationActor.companyId !== organizationId
  )) throw new Error("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
  if (verifiedPrincipalId && input.principalId && input.principalId !== verifiedPrincipalId) {
    throw new Error("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
  }
  const principalSession = input.authorizationActor?.sessionSchemaVersion === 2;
  if (principalSession && input.platformOrganizationId != null) {
    throw new Error("PLATFORM_ACTOR_LEGACY_ORGANIZATION_FORBIDDEN");
  }

  const actor: PlatformActorContext = {
    principalId: input.authorizationActor
      ? requiredOpaquePrincipalId(input.authorizationActor.principalId, "PLATFORM_PRINCIPAL_ID_INVALID")
      : input.principalId !== undefined
        ? requiredOpaquePrincipalId(input.principalId, "PLATFORM_PRINCIPAL_ID_INVALID")
        : requiredId(`pdm:${pdmUserId}`, "PLATFORM_PRINCIPAL_ID_INVALID"),
    pdmUserId,
    organizationId,
    platformOrganizationId: principalSession ? null : requiredId(
      input.platformOrganizationId ?? `pdm-company:${organizationId}`,
      "PLATFORM_ORGANIZATION_ID_INVALID"
    ),
    roles: unique(input.roles ?? []),
    scopes: unique(input.scopes ?? []),
    authProvider: input.authProvider ?? "current_pdm_session",
    correlationId,
    requestId
  };
  if (input.authorizationActor) {
    Object.defineProperty(actor, "authorizationActor", { value: input.authorizationActor, enumerable: false });
  }
  if (input.legacyRole?.trim()) Object.defineProperty(actor, "legacyRole", { value: input.legacyRole.trim(), enumerable: false });
  return actor;
}

export function createPdmCommand<TPayload>(input: {
  commandName: string;
  schemaVersion?: number;
  idempotencyKey: string;
  actor: PlatformActorContext;
  payload: TPayload;
}): PdmCommand<TPayload> {
  const commandName = requiredId(input.commandName, "PLATFORM_COMMAND_NAME_INVALID");
  const idempotencyKey = requiredId(input.idempotencyKey, "PLATFORM_IDEMPOTENCY_KEY_INVALID");
  const schemaVersion = input.schemaVersion ?? 1;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error("PLATFORM_COMMAND_SCHEMA_VERSION_INVALID");
  }
  return { commandName, schemaVersion, idempotencyKey, actor: input.actor, payload: input.payload };
}

export function createFallbackCommandMetadata(input: {
  databaseKind: "sqlite" | "postgres";
  pdmUserId: string | null | undefined;
  organizationId: string | null | undefined;
  commandName: string;
  idempotencyKey?: string | null;
}): PdmCommandMetadata {
  // Only isolated local SQLite fixtures may synthesize a command actor.
  // PostgreSQL commands require an explicitly verified request actor, even
  // when the caller labels the local profile as "system".
  if (input.databaseKind !== "sqlite") throw new Error("PLATFORM_COMMAND_METADATA_REQUIRED");
  const requestId = crypto.randomUUID();
  const actor = createPlatformActorContext({
    pdmUserId: input.pdmUserId ?? "system",
    organizationId: input.organizationId ?? "company-jenfu",
    roles: ["server_internal"],
    scopes: [input.commandName],
    authProvider: "current_pdm_session",
    requestId
  });
  return {
    actor,
    idempotencyKey: input.idempotencyKey?.trim() || `request:${requestId}`
  };
}
