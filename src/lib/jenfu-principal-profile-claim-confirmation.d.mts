import type { PrincipalInventoryInput } from './jenfu-principal-inventory-repository';

export function validateProfileClaimConfirmationBytes(
  bytes: Buffer,
  source: PrincipalInventoryInput,
  expectedSha256: string
): Record<string, unknown>;
