import { getAuthMode } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { LOCAL_QUICK_LOGIN_ACCOUNTS, type LocalQuickLoginAccount } from "@/lib/local-quick-login-config";
import { AsyncUserRepository } from "@/lib/repositories/user-async-repository";

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export function isLocalQuickLoginAvailable(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  return process.env.NODE_ENV === "development" && enabled(process.env.PDM_ENABLE_LOCAL_QUICK_LOGIN) && isLoopback && getAuthMode() !== "firebase_bff";
}

export function findLocalQuickLoginAccount(role: string) {
  const normalizedRole = role.trim().toLowerCase();
  return LOCAL_QUICK_LOGIN_ACCOUNTS.find((account) => account.role.toLowerCase() === normalizedRole || account.label === role.trim()) ?? null;
}

export async function ensureLocalQuickLoginUserAsync(account: LocalQuickLoginAccount) {
  const repository = new AsyncUserRepository(getAsyncDatabaseClient());
  let user = await repository.getUserByEmail(account.email);

  if (!user) {
    await repository.createUser({
      id: `user-${account.role.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}-local-quick`,
      displayName: account.displayName,
      email: account.email,
      passwordHash: null,
      role: account.role,
      companyCodes: account.role === "Admin" ? ["JENFU", "MAXIMA"] : ["JENFU"]
    });
    user = await repository.getUserByEmail(account.email);
  }

  if (!user) throw new Error("LOCAL_QUICK_LOGIN_USER_BOOTSTRAP_FAILED");
  if (user.role !== account.role) throw new Error("LOCAL_QUICK_LOGIN_ACCOUNT_ROLE_CONFLICT");

  await repository.restoreDemoUserForLocalValidation(user.id);
  const restoredUser = await repository.getUserById(user.id);
  if (!restoredUser) throw new Error("LOCAL_QUICK_LOGIN_USER_READBACK_FAILED");
  return restoredUser;
}
