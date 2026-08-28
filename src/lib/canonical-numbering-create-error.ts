type CanonicalNumberingCreateApiError = {
  error: string;
  status: number;
};

const DOMAIN_ERROR_CODES = [
  "APPEND_REASON_REQUIRED_FOR_FORMAL_ROOT",
  "DRAWING_PART_ROOT_MISMATCH",
  "INVALID_DRAWING_PURPOSE_CODE",
  "NUMBERING_ACTOR_REQUIRED_FOR_INITIAL_DRAWING_WORK",
  "PART_ROOT_ITEM_KIND_MISMATCH",
  "PART_ROOT_NOT_FOUND",
  "PART_ROOT_STRUCTURE_TYPE_MISMATCH",
  "PART_SEQUENCE_EXHAUSTED",
  "PRIMARY_RELATION_REQUIRES_MANUFACTURING_DRAWING",
  "ROOT_APPEND_LOCKED",
] as const;

export function canonicalNumberingCreateApiError(error: unknown): CanonicalNumberingCreateApiError {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/UNIQUE|SQLITE_CONSTRAINT|duplicate key|constraint failed/iu.test(message)) {
    return { error: "NUMBERING_ALLOCATION_CONFLICT", status: 409 };
  }
  const code = DOMAIN_ERROR_CODES.find((candidate) => message.includes(candidate));
  if (!code) return { error: "NUMBERING_CREATE_FAILED", status: 500 };
  if (code === "PART_ROOT_NOT_FOUND") return { error: code, status: 404 };
  if (code === "INVALID_DRAWING_PURPOSE_CODE") return { error: code, status: 400 };
  if (code === "NUMBERING_ACTOR_REQUIRED_FOR_INITIAL_DRAWING_WORK") return { error: code, status: 400 };
  if (code === "PART_SEQUENCE_EXHAUSTED") return { error: code, status: 409 };
  return { error: code, status: 409 };
}
