
export const OFFICIAL_NUMBERING_DRAFT_SLICE = "official-numbering-draft";
export const PRODUCTION_SLICE_UNOPENED_CODE = "feature_not_open_in_production_slice";
export const PRODUCTION_SLICE_UNOPENED_MESSAGE = "此功能未納入本次編號建立 production slice。";
export const PRODUCTION_NUMBERING_LIFECYCLE_GATE_ENV = "PDM_PRODUCTION_NUMBERING_LIFECYCLE_GATE";
export const PRODUCTION_NUMBERING_LIFECYCLE_GATES = ["containment", "draft-obsolete", "formal-obsolete"] as const;
export type ProductionNumberingLifecycleGate = (typeof PRODUCTION_NUMBERING_LIFECYCLE_GATES)[number];
export type ProductionNumberingLifecycleCapability = {
  gate: ProductionNumberingLifecycleGate;
  configured: boolean;
  valid: boolean;
  draftObsoleteOpen: boolean;
  formalObsoleteOpen: boolean;
};

type EnvLike = Record<string, string | undefined>;

type ProductionSliceState = {
  configured: boolean;
  active: boolean;
  mode: string;
  localFullFunctionValidation: boolean;
};

const openPagePaths = [
  "/",
  "/login",
  "/parts",
  "/numbering/create",
  "/numbering/request",
  "/numbering/search",
  "/numbering/drawings",
  "/numbering/part-drafts",
  "/upload",
  "/handoff",
  "/settings/accounts",
  "/settings/account-invitations",
  "/account/security",
  "/account-recovery",
  "/account-recovery/request",
  "/production-slice-blocked"
];

const alwaysAllowedApiMutationMatchers: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/auth\/login$/ },
  { method: "POST", pattern: /^\/api\/auth\/logout$/ },
  { method: "POST", pattern: /^\/api\/auth\/employee-login-intents$/ },
  { method: "POST", pattern: /^\/api\/auth\/firebase\/session$/ },
  { method: "POST", pattern: /^\/api\/account-invitations\/accept$/ },
  { method: "POST", pattern: /^\/api\/account-recovery\/lookup$/ },
  { method: "POST", pattern: /^\/api\/account-recovery\/complete$/ },
  { method: "POST", pattern: /^\/api\/account-recovery\/handoff$/ },
  { method: "POST", pattern: /^\/api\/account\/sessions\/[^/]+\/revoke$/ }
];

const sliceAllowedApiMutationMatchers: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/numbering\/duplicate-check$/ },
  { method: "POST", pattern: /^\/api\/numbering\/records$/ },
  { method: "PATCH", pattern: /^\/api\/numbering\/records\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/numbering\/roots\/[^/]+\/drawings$/ },
  { method: "POST", pattern: /^\/api\/numbering\/roots\/[^/]+\/parts$/ },
  { method: "POST", pattern: /^\/api\/numbering\/roots\/[^/]+\/drawing-part$/ },
  { method: "POST", pattern: /^\/api\/numbering\/part-number-drafts$/ },
  { method: "PATCH", pattern: /^\/api\/numbering\/part-number-drafts\/[^/]+$/ },
  { method: "PATCH", pattern: /^\/api\/numbering\/tasks\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/numbering\/notifications\/[^/]+\/(?:read|handled)$/ },
  { method: "POST", pattern: /^\/api\/numbering\/part-number-drafts\/[^/]+\/void$/ },
  { method: "POST", pattern: /^\/api\/numbering\/part-number-drafts\/[^/]+\/recycle$/ },
  { method: "PATCH", pattern: /^\/api\/numbering\/admin\/matrix$/ },
  { method: "POST", pattern: /^\/api\/numbering\/admin\/matrix$/ },
  { method: "POST", pattern: /^\/api\/admin\/account-invitations$/ },
  { method: "PATCH", pattern: /^\/api\/admin\/account-invitations$/ },
  { method: "POST", pattern: /^\/api\/admin\/accounts\/[^/]+\/lifecycle$/ },
  { method: "POST", pattern: /^\/api\/admin\/accounts\/[^/]+\/sessions\/revoke$/ },
  { method: "POST", pattern: /^\/api\/admin\/accounts\/[^/]+\/identities\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/admin\/accounts\/[^/]+\/login-aliases$/ },
  { method: "POST", pattern: /^\/api\/admin\/accounts\/[^/]+\/login-aliases\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/admin\/accounts\/[^/]+\/password-reset$/ }
];

const numberingLifecycleApiMutationMatchers: Array<{ method: string; pattern: RegExp; gate: ProductionNumberingLifecycleGate }> = [
  { method: "POST", pattern: /^\/api\/numbering\/records\/[^/]+\/obsolete$/, gate: "draft-obsolete" },
  { method: "POST", pattern: /^\/api\/lifecycle\/obsolete-requests$/, gate: "formal-obsolete" },
  { method: "POST", pattern: /^\/api\/approvals\/requests\/[^/]+\/decisions$/, gate: "formal-obsolete" },
  { method: "POST", pattern: /^\/api\/approvals\/requests\/[^/]+\/apply$/, gate: "formal-obsolete" }
];

export function getProductionSliceState(env: EnvLike = process.env): ProductionSliceState {
  const localFullFunctionValidation =
    String(env.NODE_ENV ?? "").trim() === "development" &&
    String(env.PDM_LOCAL_FULL_FUNCTION_VALIDATION ?? "").trim().toLowerCase() === "true";
  const mode = localFullFunctionValidation ? "" : String(env.PDM_PRODUCTION_SLICE_MODE ?? "").trim();
  return {
    configured: mode.length > 0,
    active: mode === OFFICIAL_NUMBERING_DRAFT_SLICE,
    mode,
    localFullFunctionValidation
  };
}

export function isProductionSliceEnforced(env: EnvLike = process.env) {
  return getProductionSliceState(env).configured;
}

export function isProductionSliceActive(env: EnvLike = process.env) {
  return getProductionSliceState(env).active;
}

export function getProductionNumberingLifecycleGate(env: EnvLike = process.env): {
  gate: ProductionNumberingLifecycleGate;
  configured: boolean;
  valid: boolean;
} {
  const state = getProductionSliceState(env);
  if (!state.configured) return { gate: "formal-obsolete", configured: false, valid: true };
  const raw = String(env[PRODUCTION_NUMBERING_LIFECYCLE_GATE_ENV] ?? "").trim().toLowerCase();
  if (PRODUCTION_NUMBERING_LIFECYCLE_GATES.includes(raw as ProductionNumberingLifecycleGate)) {
    return { gate: raw as ProductionNumberingLifecycleGate, configured: true, valid: true };
  }
  return { gate: "containment", configured: true, valid: false };
}

export function productionNumberingLifecycleCapability(env: EnvLike = process.env): ProductionNumberingLifecycleCapability {
  const parsed = getProductionNumberingLifecycleGate(env);
  const draftObsoleteOpen = parsed.gate === "draft-obsolete" || parsed.gate === "formal-obsolete";
  const formalObsoleteOpen = parsed.gate === "formal-obsolete";
  return {
    ...parsed,
    draftObsoleteOpen,
    formalObsoleteOpen
  };
}

export function isProductionNumberingLifecycleGateOpen(requiredGate: ProductionNumberingLifecycleGate, env: EnvLike = process.env) {
  const capability = productionNumberingLifecycleCapability(env);
  if (!capability.configured) return true;
  if (requiredGate === "containment") return true;
  return requiredGate === "draft-obsolete" ? capability.draftObsoleteOpen : capability.formalObsoleteOpen;
}

export function isProductionNumberingLifecycleApprovalAction(actionCode: string) {
  return [
    "numbering.obsolete_part_root",
    "numbering.obsolete_part_number",
    "numbering.obsolete_ma_drawing",
    "obsolete_part_root",
    "obsolete_part_number",
    "obsolete_ma_drawing"
  ].includes(actionCode.trim());
}

export function isWriteMethod(method: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

export function normalizePathname(pathname: string) {
  const normalized = pathname.trim() || "/";
  return normalized.length > 1 ? normalized.replace(/\/+$/u, "") : normalized;
}

export function isProductionSliceAllowedApiMutation(method: string, pathname: string, env: EnvLike = process.env) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizePathname(pathname);
  if (alwaysAllowedApiMutationMatchers.some((item) => item.method === normalizedMethod && item.pattern.test(normalizedPath))) return true;
  if (!getProductionSliceState(env).active) return false;
  const lifecycleMatcher = numberingLifecycleApiMutationMatchers.find(
    (item) => item.method === normalizedMethod && item.pattern.test(normalizedPath)
  );
  if (lifecycleMatcher) return isProductionNumberingLifecycleGateOpen(lifecycleMatcher.gate, env);
  return sliceAllowedApiMutationMatchers.some((item) => item.method === normalizedMethod && item.pattern.test(normalizedPath));
}

export function isProductionSliceOpenPagePath(pathname: string, env: EnvLike = process.env) {
  const normalizedPath = normalizePathname(pathname);
  const approvalWorkbenchOpen = normalizedPath === "/approvals" && isProductionNumberingLifecycleGateOpen("formal-obsolete", env);
  return openPagePaths.includes(normalizedPath) || approvalWorkbenchOpen ||
    normalizedPath.startsWith("/login/") ||
    normalizedPath.startsWith("/invite/");
}

export function shouldBlockProductionSlicePagePath(pathname: string, env: EnvLike = process.env) {
  const normalizedPath = normalizePathname(pathname);
  if (normalizedPath.startsWith("/api/")) return false;
  if (normalizedPath.startsWith("/_next/")) return false;
  if (normalizedPath.includes(".")) return false;
  return !isProductionSliceOpenPagePath(normalizedPath, env);
}

export function productionSliceDeniedPayload(action: string, mode = getProductionSliceState().mode) {
  return {
    error: PRODUCTION_SLICE_UNOPENED_CODE,
    message: PRODUCTION_SLICE_UNOPENED_MESSAGE,
    action,
    mode: mode || "unset"
  };
}

export function productionSliceClientStatus(env: EnvLike = process.env) {
  const state = getProductionSliceState(env);
  const lifecycle = productionNumberingLifecycleCapability(env);
  return {
    configured: state.configured,
    active: state.active,
    mode: state.mode,
    localFullFunctionValidation: state.localFullFunctionValidation,
    expectedMode: OFFICIAL_NUMBERING_DRAFT_SLICE,
    unopenedCode: PRODUCTION_SLICE_UNOPENED_CODE,
    unopenedMessage: PRODUCTION_SLICE_UNOPENED_MESSAGE,
    numberingLifecycle: lifecycle,
    openPagePaths
  };
}
