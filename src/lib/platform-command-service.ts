import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCommand } from "@/lib/platform-command";
import { PlatformMappingAsyncRepository } from "@/lib/repositories/platform-mapping-async-repository";
import { PlatformOutboxAsyncRepository } from "@/lib/repositories/platform-outbox-async-repository";

export async function executePdmCommandWithOutbox<TPayload, TResult>(input: {
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
  faultInjector?: (point: "before_outbox_enqueue" | "before_command_complete" | "after_command_complete") => void;
}): Promise<{ result: TResult; reusedFromCommandReceipt: boolean }> {
  return input.client.transaction(async (client) => {
    const mappingRepository = new PlatformMappingAsyncRepository(client);
    let platformPrincipalId = input.command.actor.principalId;
    if (input.command.actor.pdmUserId !== "system") {
      const principalMapping = await mappingRepository.ensureCurrentPrincipal(input.command.actor.pdmUserId);
      if (principalMapping.mappingStatus !== "active") throw new Error("PLATFORM_PRINCIPAL_NOT_ACTIVE");
      platformPrincipalId = principalMapping.platformPrincipalId;
    }
    const organizationMapping = await mappingRepository.ensureCurrentOrganization(input.command.actor.organizationId);
    if (organizationMapping.mappingStatus !== "active") throw new Error("PLATFORM_ORGANIZATION_NOT_ACTIVE");
    const command: PdmCommand<TPayload> = {
      ...input.command,
      actor: {
        ...input.command.actor,
        principalId: platformPrincipalId,
        platformOrganizationId: organizationMapping.platformOrganizationId
      }
    };

    const outbox = new PlatformOutboxAsyncRepository(client);
    const existing = await outbox.findCompletedCommand<TResult>(command);
    if (existing !== null) return { result: existing, reusedFromCommandReceipt: true };

    const claimed = await outbox.claimCommand(command);
    if (!claimed) {
      const completed = await outbox.findCompletedCommand<TResult>(command);
      if (completed !== null) return { result: completed, reusedFromCommandReceipt: true };
      throw new Error("PLATFORM_COMMAND_IN_PROGRESS");
    }

    const result = await input.execute(client);
    const events = input.event(result);
    input.faultInjector?.("before_outbox_enqueue");
    for (const event of Array.isArray(events) ? events : [events]) {
      await outbox.enqueue({ command, ...event });
    }
    input.faultInjector?.("before_command_complete");
    await outbox.completeCommand(command, result);
    input.faultInjector?.("after_command_complete");
    return { result, reusedFromCommandReceipt: false };
  });
}
