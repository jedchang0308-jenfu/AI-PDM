const entitlementStatusByCode: Readonly<Record<string, number>> = {
  entitlement_authority_unavailable: 503,
  entitlement_contract_mismatch: 409,
  entitlement_dual_authority_detected: 500,
  legacy_assignment_mutation_retired: 410
};

const exposedDecisionCodes = new Set([
  "entitlement_authority_unavailable",
  "entitlement_authority_unknown",
  "entitlement_contract_mismatch",
  "entitlement_assignment_not_found",
  "entitlement_role_inactive",
  "entitlement_scope_mismatch",
  "permission_explicit_deny",
  "permission_not_granted",
  "entitlement_dual_authority_detected",
  "legacy_assignment_mutation_retired",
  "entitlement_session_invalid"
]);

export function jenfuEntitlementHttpStatus(decisionCode: string | null | undefined) {
  if (!decisionCode) return 403;
  return entitlementStatusByCode[decisionCode] ?? 403;
}

export function jenfuEntitlementFailureResponse(decisionCode: string | null | undefined) {
  const code = decisionCode && exposedDecisionCodes.has(decisionCode)
    ? decisionCode
    : "permission_not_granted";
  return Response.json(
    { error: code },
    {
      status: jenfuEntitlementHttpStatus(code),
      headers: { "cache-control": "no-store" }
    }
  );
}
