const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

export function isSafePdmApprovalReturnTo(value: string | null | undefined): value is string {
  return Boolean(
    value
      && value.startsWith("/approvals")
      && value.startsWith("/")
      && !value.startsWith("//")
      && !CONTROL_CHARACTER_PATTERN.test(value)
  );
}

export function normalizePdmApprovalReturnTo(value: string | null | undefined, fallback = "/approvals") {
  return isSafePdmApprovalReturnTo(value) ? value : fallback;
}
