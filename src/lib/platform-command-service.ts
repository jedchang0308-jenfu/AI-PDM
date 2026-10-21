import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCommand, PdmCommandMetadata } from "@/lib/platform-command";
import { createJenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { principalCommandRouteMatches } from "@/lib/principal-command-route-proof";
import {
  evaluatePrincipalWorkspacePermissionsInSnapshot,
  type PrincipalWorkspaceDecision,
  type PrincipalWorkspacePermission
} from "@/lib/jenfu-principal-permission-service";
import {
  withVerifiedJenfuPrincipalRequest, type PrincipalRequestInput,
  type VerifiedPrincipalRequest
} from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";
import { canonicalCapabilityGroups, isDynamicRolePolicyInSnapshot,
  type PrincipalCapabilityGroup } from "@/lib/principal-resource-capability";
import { AsyncMasterAttachmentRepository, normalizeMasterAttachmentCategory } from "@/lib/repositories/master-attachment-async-repository";
import type { MasterAttachmentCategory } from "@/lib/repositories/master-attachment-repository";
import { PlatformMappingAsyncRepository } from "@/lib/repositories/platform-mapping-async-repository";
import { PlatformOutboxAsyncRepository } from "@/lib/repositories/platform-outbox-async-repository";

type CommandInput<TPayload, TResult> = {
  client: AsyncDatabaseClient;
  command: PdmCommand<TPayload>;
  execute: (client: AsyncDatabaseClient, primaryDecision: PrincipalWorkspaceDecision | null,
    verified: VerifiedPrincipalRequest | null, context?: PdmCommandExecutionContext) => Promise<TResult>;
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

/** Server-derived values resolved in the command snapshot and handed to the write callback. */
export type PdmCommandExecutionContext = {
  validatedAttachmentCategory?: MasterAttachmentCategory;
};

type AttachmentCommandAuthorization = {
  groups: PrincipalCapabilityGroup[];
  documentCategory?: MasterAttachmentCategory;
};

type AttachmentCommandBinding = {
  entityType: "drawing_number" | "part_number";
  routePath: string;
  method: string;
  suffix: "previews" | "restore" | null;
  deleted: boolean;
};

function attachmentCommandBinding(commandName: string): AttachmentCommandBinding | null {
  if (commandName === "pdm.master_attachment.delete") return {
    entityType: "part_number", routePath: "src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts",
    method: "DELETE", suffix: null, deleted: false
  };
  if (commandName === "pdm.master_attachment.restore") return {
    entityType: "part_number", routePath: "src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts",
    method: "POST", suffix: "restore", deleted: true
  };
  if (commandName === "pdm.master_attachment.preview") return null;
  return null;
}

function decodePathSegment(value: string) {
  try { return decodeURIComponent(value); } catch { return null; }
}

async function resolveAttachmentCommandGroupsInSnapshot(
  client: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest,
  route: NonNullable<CommandInput<unknown, unknown>["principalAuthorization"]>,
  commandName: string,
  rawPayload: unknown
): Promise<AttachmentCommandAuthorization | null> {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload as Record<string, unknown> : {};
  if (commandName === "pdm.master_attachment.upload") {
    const routePath = "src/app/api/parts/[partNumber]/attachments/route.ts";
    const pathname = new URL(route.request.url).pathname;
    const match = /^\/api\/parts\/([^/]+)\/attachments$/u.exec(pathname);
    const code = match ? decodePathSegment(match[1]) : null;
    if (route.routePath !== routePath || route.method !== "POST" ||
        route.permissionCode !== "numbering.attachments.manage" ||
        payload.entityType !== "part_number" || typeof payload.entityCode !== "string" ||
        typeof payload.documentCategory !== "string" || !match || code !== payload.entityCode) {
      throw new Error("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
    }
    const repository = new AsyncMasterAttachmentRepository(client, undefined, undefined, {
      companyId: verified.profile.companyId, principalId: verified.session.principalId,
      profileId: verified.profile.pdmUserId, profileVersion: verified.session.profileVersion
    });
    const entity = await repository.resolveCompanyEntity({
      entityType: "part_number", entityCode: payload.entityCode, companyId: verified.profile.companyId
    });
    if (!entity || entity.entityCode !== payload.entityCode) {
      throw new JenfuEntitlementRepositoryError("permission_not_granted");
    }
    const documentCategory = normalizeMasterAttachmentCategory(entity.entityType, payload.documentCategory);
    const groups = canonicalCapabilityGroups(entity.entityType, documentCategory);
    if (!groups.includes("part") || groups.some(group => !["part", "model"].includes(group))) {
      throw new Error("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
    }
    return { groups, documentCategory };
  }
  let binding = attachmentCommandBinding(commandName);
  if (commandName === "pdm.master_attachment.preview") {
    if (route.routePath === "src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts" && route.method === "POST") {
      binding = { entityType: "part_number", routePath: route.routePath, method: "POST", suffix: "previews", deleted: false };
    } else if (route.routePath === "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/previews/route.ts" && route.method === "POST") {
      binding = { entityType: "drawing_number", routePath: route.routePath, method: "POST", suffix: "previews", deleted: false };
    }
  }
  if (!binding) {
    if (["pdm.master_attachment.delete", "pdm.master_attachment.restore", "pdm.master_attachment.preview"].includes(commandName)) {
      throw new Error("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
    }
    return null;
  }
  if (route.routePath !== binding.routePath || route.method !== binding.method ||
      route.permissionCode !== "numbering.attachments.manage" ||
      payload.entityType !== binding.entityType || typeof payload.entityCode !== "string" ||
      typeof payload.attachmentId !== "string") {
    throw new Error("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
  }
  const pathname = new URL(route.request.url).pathname;
  const match = binding.entityType === "part_number"
    ? /^\/api\/parts\/([^/]+)\/attachments\/([^/]+)(?:\/(previews|restore))?$/u.exec(pathname)
    : /^\/api\/numbering\/drawings\/([^/]+)\/attachments\/([^/]+)\/(previews)$/u.exec(pathname);
  const code = match ? decodePathSegment(match[1]) : null;
  const attachmentId = match ? decodePathSegment(match[2]) : null;
  const suffix = binding.entityType === "part_number" ? match?.[3] ?? null : match?.[3] ?? null;
  if (!match || code !== payload.entityCode || attachmentId !== payload.attachmentId || suffix !== binding.suffix) {
    throw new Error("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
  }

  const repository = new AsyncMasterAttachmentRepository(client, undefined, undefined, {
    companyId: verified.profile.companyId, principalId: verified.session.principalId,
    profileId: verified.profile.pdmUserId, profileVersion: verified.session.profileVersion
  });
  let attachment;
  if (binding.deleted) {
    const deleted = await repository.listDeletedMasterAttachmentsInCompany({
      entityType: binding.entityType, entityCode: payload.entityCode, companyId: verified.profile.companyId
    });
    attachment = deleted?.attachments.find(item => item.attachment.id === payload.attachmentId)?.attachment ?? null;
  } else {
    attachment = await repository.getMasterAttachmentInCompany({
      entityType: binding.entityType, entityCode: payload.entityCode,
      attachmentId: payload.attachmentId, companyId: verified.profile.companyId
    });
  }
  if (!attachment || attachment.entityType !== binding.entityType) {
    throw new JenfuEntitlementRepositoryError("permission_not_granted");
  }
  const category = normalizeMasterAttachmentCategory(binding.entityType, attachment.documentCategory);
  const groups = canonicalCapabilityGroups(attachment.entityType, category);
  const parentGroup = binding.entityType === "drawing_number" ? "drawing" : "part";
  if (!groups.includes(parentGroup) || groups.some(group => !["drawing", "part", "model", "transfer"].includes(group))) {
    throw new Error("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
  }
  return { groups, documentCategory: category };
}

async function executeWithinClient<TPayload, TResult>(
  input: CommandInput<TPayload, TResult>, client: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest | null
): Promise<{ result: TResult; reusedFromCommandReceipt: boolean }> {
    let primaryDecision: PrincipalWorkspaceDecision | null = null;
    let validatedAttachmentCategory: MasterAttachmentCategory | undefined;
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
        { discriminator: route.discriminator, expectedPermissionCode: route.permissionCode });
      const resourceBinding = route?.resourceBinding;
      const submissionShareCommand = Boolean(resourceBinding) &&
        resourceBinding?.kind === "submission_share" &&
        ((route?.routePath === "src/app/api/submissions/[id]/shares/route.ts" && route.method === "POST" &&
          route.permissionCode === "submission.share" && input.command.commandName === "pdm.submission_share.create") ||
         (route?.routePath === "src/app/api/submissions/[id]/shares/[shareId]/route.ts" && route.method === "PATCH" &&
          route.permissionCode === "submission.share" && input.command.commandName === "pdm.submission_share.revoke"));
      if (!verifiedActor || !policy || !["POST", "PUT", "PATCH", "DELETE"].includes(route.method) ||
          !principalCommandRouteMatches(route.request, route.routePath, route.method) ||
          principalSessionTokenFromRequest(route.request) !== input.principalRequest?.token ||
          policy.authorizationMode !== "permission" ||
          (policy.scopeResolver !== "workspace" &&
            !(policy.scopeResolver === "submission company" && submissionShareCommand)) ||
          (policy.scopeResolver === "workspace" && resourceBinding) ||
          !route ||
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
      const additional = route.additionalPermissionCodes ?? [];
      const payload = input.command.payload as {
        drawingPurposeCode?: unknown;
        linkDrawingNumber?: unknown;
        linkPartNumber?: unknown;
        linkRelationType?: unknown;
      };
      const needsLinkVariant =
        (input.command.commandName === "pdm.numbering.create_official_record" &&
          Boolean(payload.drawingPurposeCode)) ||
        (input.command.commandName === "pdm.numbering.append_drawing" &&
          Boolean(payload.linkPartNumber) && payload.linkRelationType !== "none") ||
        (input.command.commandName === "pdm.numbering.append_part" &&
          Boolean(payload.linkDrawingNumber) && payload.linkRelationType !== "none") ||
        input.command.commandName === "pdm.numbering.append_drawing_part";
      const expectedAdditional = needsLinkVariant ? ["numbering.link_variant"] : [];
      if (additional.length !== expectedAdditional.length ||
          additional.some((code, index) => code !== expectedAdditional[index]) ||
          (needsLinkVariant && route.permissionCode !== "numbering.create")) {
        throw new Error("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
      }
      const attachmentPolicyCommand = ["pdm.master_attachment.delete", "pdm.master_attachment.restore",
        "pdm.master_attachment.preview", "pdm.master_attachment.upload"].includes(input.command.commandName);
      const dynamicAttachmentPolicy = attachmentPolicyCommand && await isDynamicRolePolicyInSnapshot(client);
      const attachmentAuthorization = input.command.commandName === "pdm.master_attachment.upload"
        ? await resolveAttachmentCommandGroupsInSnapshot(
          client, verified, route, input.command.commandName, input.command.payload)
        : dynamicAttachmentPolicy
          ? await resolveAttachmentCommandGroupsInSnapshot(
            client, verified, route, input.command.commandName, input.command.payload)
          : null;
      validatedAttachmentCategory = attachmentAuthorization?.documentCategory;
      const permissions: PrincipalWorkspacePermission[] = [route.permissionCode, ...additional].map((permissionCode) =>
        ({ permissionKind: "action" as const, permissionCode }));
      if (dynamicAttachmentPolicy && attachmentAuthorization) {
        const parentGroups = attachmentAuthorization.groups.filter(group => group !== "model");
        permissions[0] = { ...permissions[0], resourceGroups: parentGroups };
        if (attachmentAuthorization.groups.includes("model")) {
          permissions.push({ permissionKind: "action", permissionCode: "pdm.model.edit" });
        }
      }
      const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, verified, permissions);
      if (decisions.length !== permissions.length || decisions.some((decision, index) =>
        !decision.allowed || decision.principalId !== verified.session.principalId ||
        decision.permissionCode !== permissions[index].permissionCode)) {
        if (submissionShareCommand) throw new JenfuEntitlementRepositoryError("permission_not_granted");
        throw new Error("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED");
      }
      primaryDecision = decisions[0];
      if (submissionShareCommand) {
        const actualPath = new URL(route.request.url).pathname;
        const create = route.routePath === "src/app/api/submissions/[id]/shares/route.ts";
        const match = create
          ? /^\/api\/submissions\/([^/]+)\/shares$/u.exec(actualPath)
          : /^\/api\/submissions\/([^/]+)\/shares\/([^/]+)$/u.exec(actualPath);
        const payload = input.command.payload as Record<string, unknown>;
        if (!match || !resourceBinding || match[1] !== resourceBinding.submissionId ||
            payload.submissionId !== resourceBinding.submissionId ||
            (create ? resourceBinding.shareId !== undefined :
              !resourceBinding.shareId || match[2] !== resourceBinding.shareId || payload.shareId !== resourceBinding.shareId)) {
          throw new Error("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
        }
        const submission = await client.queryOne<{ id: string; company_id: string; status: string }>(
          `SELECT s.id,s.company_id,s.status FROM ai_pdm_core.submissions s
           WHERE s.id=:submissionId AND s.company_id=:companyId`,
          { submissionId: resourceBinding.submissionId, companyId: verified.profile.companyId });
        if (!submission) throw new JenfuEntitlementRepositoryError("permission_not_granted");
        if (create) {
          const releasePackage = await client.queryOne<{ id: string }>(
            "SELECT id FROM ai_pdm_core.release_packages WHERE submission_id=:submissionId",
            { submissionId: resourceBinding.submissionId });
          if (submission.status !== "Released" || !releasePackage) {
            throw new Error("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_STATE_INVALID");
          }
        } else {
          const share = await client.queryOne<{ id: string }>(
            `SELECT id FROM ai_pdm_core.readonly_shares
             WHERE id=:shareId AND submission_id=:submissionId`,
            { shareId: resourceBinding.shareId, submissionId: resourceBinding.submissionId });
          if (!share) throw new JenfuEntitlementRepositoryError("permission_not_granted");
        }
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
        // The verified request and this command share a transaction. Reuse the
        // account repository's fail-closed activation check; the command must
        // not consult the per-profile cutover reader a second time.
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

    const result = await input.execute(client, primaryDecision, verified,
      validatedAttachmentCategory ? { validatedAttachmentCategory } : undefined);
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
