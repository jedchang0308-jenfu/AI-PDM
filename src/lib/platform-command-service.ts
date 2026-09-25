import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCommand, PdmCommandMetadata } from "@/lib/platform-command";
import { createJenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import {
  withVerifiedJenfuPrincipalRequest, type PrincipalRequestInput,
  type VerifiedPrincipalRequest
} from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";
import { PlatformMappingAsyncRepository } from "@/lib/repositories/platform-mapping-async-repository";
import { PlatformOutboxAsyncRepository } from "@/lib/repositories/platform-outbox-async-repository";

type CommandInput<TPayload, TResult> = {
  client: AsyncDatabaseClient;
  command: PdmCommand<TPayload>;
  execute: (client: AsyncDatabaseClient) => Promise<TResult>;
  event: (result: TResult) => {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKeySuffix?: string;
  } | Array<{
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKeySuffix?: string;
  }>;
  idempotencyPayload?: unknown;
  serializable?: boolean;
  principalRequest?: PrincipalRequestInput;
  principalAuthorization?: PdmCommandMetadata["principalAuthorization"];
  faultInjector?: (point: "before_outbox_enqueue" | "before_command_complete" | "after_command_complete") => void;
};

function principalCommandRouteMatches(request: Request, routePath: string, method: string): boolean {
  if (request.method !== method || !routePath.startsWith("src/app/api/") ||
      !routePath.endsWith("/route.ts")) return false;
  let actual: string;
  try { actual = new URL(request.url).pathname; }
  catch { return false; }
  const template = routePath.slice("src/app".length, -"/route.ts".length).split("/");
  const segments = actual.split("/");
  return template.length === segments.length && template.every((segment, index) =>
    /^\[[^\]]+\]$/u.test(segment) ? segments[index].length > 0 : segment === segments[index]);
}

async function executeWithinClient<TPayload, TResult>(
  input: CommandInput<TPayload, TResult>, client: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest | null
): Promise<{ result: TResult; reusedFromCommandReceipt: boolean }> {
    const verifiedActor = verified
      ? createJenfuVerifiedAuthorizationActor({
        identityIssuer: verified.session.identityIssuer,
        identitySubject: verified.session.identitySubject,
        principalId: verified.session.principalId,
        employeeId: verified.session.employeeId,
        localPrincipalId: verified.profile.pdmUserId,
        companyId: verified.profile.companyId,
        sessionSchemaVersion: 2
      })
      : input.command.actor.authorizationActor;
    if (verified) {
      const route = input.principalAuthorization;
      const policy = route && resolveJenfuRoutePolicy(route.routePath, route.method,
        { expectedPermissionCode: route.permissionCode });
      if (!verifiedActor || !policy || !["POST", "PUT", "PATCH", "DELETE"].includes(route.method) ||
          !principalCommandRouteMatches(route.request, route.routePath, route.method) ||
          principalSessionTokenFromRequest(route.request) !== input.principalRequest?.token ||
          policy.authorizationMode !== "permission" ||
          policy.scopeResolver !== "workspace" || !route ||
          input.command.actor.principalId !== verifiedActor.principalId ||
          input.command.actor.pdmUserId !== verifiedActor.localPrincipalId ||
          input.command.actor.organizationId !== verifiedActor.companyId) {
        throw new Error("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
      }
      const mode = await client.queryOne<{ isolation_level: string }>(
        "SELECT current_setting('transaction_isolation') AS isolation_level");
      if (!mode || !["repeatable read", "serializable"].includes(mode.isolation_level)) {
        throw new Error("PLATFORM_PRINCIPAL_COMMAND_SNAPSHOT_REQUIRED");
      }
      const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, verified,
        [{ permissionKind: "action", permissionCode: route.permissionCode }]);
      if (decisions.length !== 1 || !decisions[0].allowed) {
        throw new Error("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED");
      }
    }
    const platformPrincipalId = input.command.actor.principalId;
    // "system" is a SQLite fixture sentinel, not a production security subject.
    // Every PostgreSQL command must carry a verified actor, including commands
    // whose caller supplies that sentinel as the local profile ID.
    if (client.kind === "postgres" &&
        (input.command.actor.pdmUserId === "system" || !verified ||
         !verifiedActor || verifiedActor.sessionSchemaVersion !== 2)) {
      throw new Error("PLATFORM_ACTOR_VERIFICATION_REQUIRED");
    }
    const mappingRepository = client.kind === "postgres"
      ? null : new PlatformMappingAsyncRepository(client);
    if (input.command.actor.pdmUserId !== "system") {
      if (verifiedActor && (
        verifiedActor.localPrincipalId !== input.command.actor.pdmUserId
        || verifiedActor.companyId !== input.command.actor.organizationId
        || verifiedActor.principalId !== platformPrincipalId
      )) throw new Error("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
      // A principal actor stamp from an earlier transaction is never enough.
      if (verifiedActor?.sessionSchemaVersion === 2 && !verified) {
        throw new Error("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_REQUIRED");
      }
      if (client.kind === "postgres") {
        const cutover = await client.queryOne<{ status: string; principal_id: string | null }>(`
          SELECT status,principal_id
          FROM ai_pdm_core.read_principal_cutover_for_command_v1(:pdmUserId)
        `, { pdmUserId: input.command.actor.pdmUserId });
        if (cutover?.status !== "principal_active" ||
            cutover.principal_id !== platformPrincipalId) {
          throw new Error("PLATFORM_PRINCIPAL_NOT_ACTIVE");
        }
        const account = await new JenfuPrincipalAccountRepository(client).requireActive(platformPrincipalId);
        if (account.pdmUserId !== verifiedActor!.localPrincipalId ||
          account.companyId !== verifiedActor!.companyId) {
          throw new Error("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
        }
      } else {
        // SQLite is an isolated historical fixture. It cannot establish a
        // production security subject or publish a principal mapping.
        const principalMapping = await mappingRepository!.findCurrentPrincipal(input.command.actor.pdmUserId);
        if (!principalMapping || principalMapping.mappingStatus !== "active") {
          throw new Error("PLATFORM_PRINCIPAL_NOT_ACTIVE");
        }
        // A historical mapping may confirm the actor's binding, but it must
        // never choose or rewrite the security subject of the command.
        if (principalMapping.pdmUserId !== input.command.actor.pdmUserId ||
          principalMapping.platformPrincipalId !== platformPrincipalId ||
          (verifiedActor && principalMapping.pdmUserId !== verifiedActor.localPrincipalId)) {
          throw new Error("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
        }
      }
    }
    // Principal commands already carry a verified workspace. They must not
    // create or consult a historical Platform organization mapping.
    const organizationMapping = verifiedActor?.sessionSchemaVersion === 2
      ? null
      : await mappingRepository!.findCurrentOrganization(input.command.actor.organizationId);
    if (verifiedActor?.sessionSchemaVersion !== 2 &&
        (!organizationMapping || organizationMapping.mappingStatus !== "active")) {
      throw new Error("PLATFORM_ORGANIZATION_NOT_ACTIVE");
    }
    const command: PdmCommand<TPayload> = {
      ...input.command,
      actor: {
        ...input.command.actor,
        principalId: platformPrincipalId,
        platformOrganizationId: verifiedActor?.sessionSchemaVersion === 2
          ? null : organizationMapping?.platformOrganizationId ?? input.command.actor.platformOrganizationId
      }
    };
    if (verifiedActor) {
      Object.defineProperty(command.actor, "authorizationActor", {
        value: verifiedActor,
        enumerable: false
      });
    }

    const outbox = new PlatformOutboxAsyncRepository(client);
    const existing = await outbox.findCompletedCommand<TResult>(command, input.idempotencyPayload);
    if (existing.completed) return { result: existing.result, reusedFromCommandReceipt: true };

    const claimed = await outbox.claimCommand(command, input.idempotencyPayload);
    if (!claimed) {
      const completed = await outbox.findCompletedCommand<TResult>(command, input.idempotencyPayload);
      if (completed.completed) return { result: completed.result, reusedFromCommandReceipt: true };
      throw new Error("PLATFORM_COMMAND_IN_PROGRESS");
    }

    const result = await input.execute(client);
    const events = input.event(result);
    input.faultInjector?.("before_outbox_enqueue");
    for (const event of Array.isArray(events) ? events : [events]) {
      await outbox.enqueue({ command, ...event });
    }
    input.faultInjector?.("before_command_complete");
    await outbox.completeCommand(command, result, input.idempotencyPayload);
    input.faultInjector?.("after_command_complete");
    return { result, reusedFromCommandReceipt: false };
}

export async function executePdmCommandWithOutbox<TPayload, TResult>(
  input: CommandInput<TPayload, TResult>
): Promise<{ result: TResult; reusedFromCommandReceipt: boolean }> {
  const principalActor = input.command.actor.authorizationActor?.sessionSchemaVersion === 2;
  if (Boolean(input.principalRequest) !== Boolean(input.principalAuthorization) ||
      (Boolean(input.principalRequest) && !principalActor)) {
    throw new Error("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
  }
  if (principalActor) {
    if (!input.principalRequest || !input.principalAuthorization) {
      throw new Error("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_REQUIRED");
    }
    return withVerifiedJenfuPrincipalRequest(
      { ...input.principalRequest, database: input.client },
      (client, verified) => executeWithinClient(input, client, verified),
      { readOnly: false, isolationLevel: input.serializable ? "serializable" : "repeatable_read" }
    );
  }
  return input.client.transaction(
    (client) => executeWithinClient(input, client, null),
    { serializable: input.serializable });
}
