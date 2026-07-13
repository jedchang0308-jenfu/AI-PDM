import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { hashPassword } from "@/lib/password";
import { validateFirstPassword } from "@/lib/account-invitations";
import {
  AccountLifecycleError,
  AsyncAccountLifecycleRepository,
  type AccountLifecycleAction,
  type AdminAccountDetail,
  type AdminAccountSummary
} from "@/lib/repositories/account-lifecycle-async-repository";
import type { AuthIdentityStatus } from "@/lib/repositories/auth-identity-async-repository";

export { AccountLifecycleError };
export type { AccountLifecycleAction, AdminAccountDetail, AdminAccountSummary };

function repository() {
  return new AsyncAccountLifecycleRepository(getAsyncDatabaseClient());
}

export async function listAdminAccountsAsync(input: {
  query?: string;
  status?: string;
  provider?: string;
  role?: string;
  limit?: number;
} = {}) {
  return repository().listAccounts(input);
}

export async function getAdminAccountDetailAsync(userId: string) {
  return repository().getAccountDetail(userId.trim());
}

export async function updateAdminAccountLifecycleAsync(input: {
  actorId: string;
  userId: string;
  action: AccountLifecycleAction;
  reason: string;
}) {
  return repository().updateLifecycle(input);
}

export async function revokeAdminAccountSessionsAsync(input: { actorId: string; userId: string; reason?: string }) {
  return repository().revokeSessions(input);
}

export async function updateAdminAccountIdentityAsync(input: {
  actorId: string;
  userId: string;
  identityId: string;
  status: AuthIdentityStatus;
  reason: string;
}) {
  return repository().updateIdentityStatus(input);
}

export async function createAdminAccountPasswordResetAsync(input: {
  actorId: string;
  userId: string;
  expiresInMinutes?: number;
}) {
  return repository().createPasswordReset(input);
}

export async function lookupAccountRecoveryAsync(token: string) {
  return repository().lookupRecoveryRequest(token);
}

export async function completeAccountRecoveryAsync(input: { token: string; password: string }) {
  const passwordError = validateFirstPassword(input.password);
  if (passwordError) {
    throw new AccountLifecycleError("invalid_recovery_password", passwordError, 400);
  }
  return repository().completeRecovery({
    token: input.token,
    passwordHash: hashPassword(input.password)
  });
}
