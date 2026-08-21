import type { UserRole } from "@/lib/auth-config";

export type LocalQuickLoginAccount = {
  label: string;
  role: UserRole;
  email: string;
  displayName: string;
};

export const LOCAL_QUICK_LOGIN_ACCOUNTS: readonly LocalQuickLoginAccount[] = [
  { label: "工程師", role: "Engineer", email: "engineer@example.com", displayName: "Demo Engineer" },
  { label: "研發主管", role: "R&D Manager", email: "manager@example.com", displayName: "Demo Manager" },
  { label: "系統管理員", role: "Admin", email: "admin@example.com", displayName: "Demo Admin" },
  { label: "製造", role: "Manufacturing", email: "manufacturing@example.com", displayName: "Demo Manufacturing" },
  { label: "採購", role: "Procurement", email: "procurement@example.com", displayName: "Demo Procurement" }
] as const;
