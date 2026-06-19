export type UserRole = "Engineer" | "R&D Manager" | "Admin" | "Manufacturing" | "Procurement";

export function getAuthMode() {
  return process.env.PDM_AUTH_MODE === "managed" ? "managed" : "demo";
}
