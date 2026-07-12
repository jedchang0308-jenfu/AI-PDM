import crypto from "node:crypto";
import type { UserRole } from "@/lib/auth-config";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { hashPassword } from "@/lib/password";
import {
  AccountInvitationError,
  AsyncAccountInvitationRepository,
  type AccountInvitationSummary
} from "@/lib/repositories/account-invitation-async-repository";

export { AccountInvitationError };
export type { AccountInvitationSummary };

export const ACCOUNT_INVITATION_ROLES = ["Engineer", "R&D Manager", "Admin", "Manufacturing", "Procurement"] as const satisfies readonly UserRole[];
export const ACCOUNT_INVITATION_DEFAULT_EXPIRY_DAYS = 7;
export const ACCOUNT_INVITATION_MIN_PASSWORD_LENGTH = 10;

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) && email.length <= 254;
}

function normalizeToken(token: string) {
  const normalized = token.trim();
  if (normalized.length < 20 || normalized.length > 200 || !/^[A-Za-z0-9_-]+$/u.test(normalized)) {
    throw new AccountInvitationError("invalid_invitation", "邀請連結不完整，請重新開啟原始郵件中的連結。", 400);
  }
  return normalized;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function validateFirstPassword(password: string) {
  if (password.length < ACCOUNT_INVITATION_MIN_PASSWORD_LENGTH || password.length > 128) {
    return `密碼需為 ${ACCOUNT_INVITATION_MIN_PASSWORD_LENGTH} 至 128 個字元。`;
  }
  if (!/[A-Za-z]/u.test(password) || !/[0-9]/u.test(password)) {
    return "密碼至少需要包含一個英文字母與一個數字。";
  }
  return null;
}

function invitationRepository() {
  return new AsyncAccountInvitationRepository(getAsyncDatabaseClient());
}

export async function listAccountInvitationsAsync(limit = 100) {
  return invitationRepository().list(limit);
}

export async function createAccountInvitationAsync(input: {
  email: string;
  displayName: string;
  role: UserRole;
  invitedBy: string;
  expiresInDays?: number;
}): Promise<{ invitation: AccountInvitationSummary; token: string }> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!validateEmail(email)) {
    throw new AccountInvitationError("invalid_invitation", "請輸入有效的電子郵件。", 400);
  }
  if (displayName.length < 2 || displayName.length > 80) {
    throw new AccountInvitationError("invalid_invitation", "姓名需為 2 至 80 個字元。", 400);
  }
  if (!ACCOUNT_INVITATION_ROLES.includes(input.role)) {
    throw new AccountInvitationError("invalid_invitation", "請選擇有效的帳號角色。", 400);
  }

  const expiresInDays = Number.isFinite(input.expiresInDays)
    ? Math.trunc(input.expiresInDays ?? ACCOUNT_INVITATION_DEFAULT_EXPIRY_DAYS)
    : ACCOUNT_INVITATION_DEFAULT_EXPIRY_DAYS;
  if (expiresInDays < 1 || expiresInDays > 30) {
    throw new AccountInvitationError("invalid_invitation", "邀請有效期限需為 1 至 30 天。", 400);
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const invitation = await invitationRepository().create({
    email,
    displayName,
    role: input.role,
    companyId: "company-jenfu",
    tokenHash: hashToken(token),
    invitedBy: input.invitedBy,
    expiresAt
  });
  return { invitation, token };
}

export async function lookupAccountInvitationAsync(token: string) {
  const normalized = normalizeToken(token);
  return invitationRepository().lookupByTokenHash(hashToken(normalized));
}

export async function acceptAccountInvitationAsync(input: { token: string; password: string }) {
  const normalized = normalizeToken(input.token);
  const passwordError = validateFirstPassword(input.password);
  if (passwordError) {
    throw new AccountInvitationError("invalid_invitation", passwordError, 400);
  }
  return invitationRepository().accept({ tokenHash: hashToken(normalized), passwordHash: hashPassword(input.password) });
}

export async function acceptAccountInvitationWithGoogleAsync(input: {
  invitationId: string;
  expectedEmail: string;
  googleSubject: string;
  googleEmail: string;
}) {
  if (!input.invitationId.trim()) {
    throw new AccountInvitationError("invalid_invitation", "缺少邀請識別資料。", 400);
  }
  return invitationRepository().acceptWithGoogle({
    invitationId: input.invitationId.trim(),
    expectedEmail: input.expectedEmail.trim().toLowerCase(),
    googleSubject: input.googleSubject.trim(),
    googleEmail: input.googleEmail.trim().toLowerCase()
  });
}

export async function revokeAccountInvitationAsync(input: { invitationId: string; revokedBy: string }) {
  const invitationId = input.invitationId.trim();
  if (!invitationId) throw new AccountInvitationError("invalid_invitation", "缺少邀請識別資料。", 400);
  return invitationRepository().revoke({ invitationId, revokedBy: input.revokedBy });
}
