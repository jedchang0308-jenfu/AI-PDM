import { isNumberStateFlowV1Enabled } from "@/lib/number-state-flow-feature";

export const OFFICIAL_NUMBERING_DRAFT_SLICE = "official-numbering-draft";
export const PRODUCTION_SLICE_UNOPENED_CODE = "feature_not_open_in_production_slice";
export const PRODUCTION_SLICE_UNOPENED_MESSAGE = "此功能未納入本次正式領號 / 保留號 production slice。";

type EnvLike = Record<string, string | undefined>;

type ProductionSliceState = {
  configured: boolean;
  active: boolean;
  mode: string;
};

const openPagePaths = [
  "/",
  "/login",
  "/parts",
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
  "/privacy",
  "/privacy/acknowledgement",
  "/production-slice-blocked"
];

const alwaysAllowedApiMutationMatchers: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/auth\/login$/ },
  { method: "POST", pattern: /^\/api\/auth\/logout$/ },
  { method: "POST", pattern: /^\/api\/auth\/employee-login-intents$/ },
  { method: "POST", pattern: /^\/api\/auth\/firebase\/session$/ },
  { method: "POST", pattern: /^\/api\/privacy\/acknowledgements\/current$/ },
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

const numberStateFlowApiMutationMatchers: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/numbering\/draft-workspaces$/ },
  { method: "PATCH", pattern: /^\/api\/numbering\/draft-workspaces\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/numbering\/draft-workspaces\/[^/]+\/(candidate-numbers|cancel)$/ }
];

export function getProductionSliceState(env: EnvLike = process.env): ProductionSliceState {
  const mode = String(env.PDM_PRODUCTION_SLICE_MODE ?? "").trim();
  return {
    configured: mode.length > 0,
    active: mode === OFFICIAL_NUMBERING_DRAFT_SLICE,
    mode
  };
}

export function isProductionSliceEnforced(env: EnvLike = process.env) {
  return getProductionSliceState(env).configured;
}

export function isProductionSliceActive(env: EnvLike = process.env) {
  return getProductionSliceState(env).active;
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
  if (isNumberStateFlowV1Enabled(env) && numberStateFlowApiMutationMatchers.some((item) => item.method === normalizedMethod && item.pattern.test(normalizedPath))) {
    return true;
  }
  return sliceAllowedApiMutationMatchers.some((item) => item.method === normalizedMethod && item.pattern.test(normalizedPath));
}

export function isProductionSliceOpenPagePath(pathname: string, env: EnvLike = process.env) {
  const normalizedPath = normalizePathname(pathname);
  return openPagePaths.includes(normalizedPath) ||
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
  return {
    configured: state.configured,
    active: state.active,
    mode: state.mode,
    expectedMode: OFFICIAL_NUMBERING_DRAFT_SLICE,
    unopenedCode: PRODUCTION_SLICE_UNOPENED_CODE,
    unopenedMessage: PRODUCTION_SLICE_UNOPENED_MESSAGE,
    openPagePaths
  };
}
