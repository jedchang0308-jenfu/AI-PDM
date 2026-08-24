import type { CanonicalNumberingItemKind } from "@/lib/numbering-item-kind";

export type CreateContent = "part" | "drawing" | "drawing_part";
export type CreateScope = "new_root" | "existing_root";
export type CreatePurposeCode = "M" | "R";

export type PartCreateFields = {
  itemKind: CanonicalNumberingItemKind;
  isUniversal: boolean;
  seriesCode?: string | null;
  customSpecification?: string | null;
};

export type DrawingCreateFields = {
  purposeCode: CreatePurposeCode;
  referencePurpose?: string | null;
};

type ManufacturedPartCreateFields = Omit<PartCreateFields, "itemKind"> & {
  itemKind: "manufactured";
};

type PurchasedPartCreateFields = Omit<PartCreateFields, "itemKind"> & {
  itemKind: "purchased";
};

type ExistingRootFields = {
  rootCode: string;
  appendReason?: string | null;
};

export type CanonicalNumberingCreateIntent =
  | ({ scope: "new_root"; content: "part"; coreName: string } & PurchasedPartCreateFields)
  | ({ scope: "new_root"; content: "drawing_part"; coreName: string; purposeCode: "M"; referencePurpose?: null } & ManufacturedPartCreateFields)
  | ({ scope: "new_root"; content: "drawing_part"; coreName: string; purposeCode: "R"; referencePurpose: string } & PurchasedPartCreateFields)
  | ({ scope: "existing_root"; content: "part" } & ExistingRootFields & PartCreateFields)
  | ({ scope: "existing_root"; content: "drawing" } & ExistingRootFields & DrawingCreateFields)
  | ({ scope: "existing_root"; content: "drawing_part" } & ExistingRootFields & PartCreateFields & DrawingCreateFields);

export type ProductNameSuggestionInput = {
  itemKind: CanonicalNumberingItemKind;
  primaryNoun: string;
  seriesCode?: string | null;
  brand?: string | null;
  specificationModel?: string | null;
  feature?: string | null;
  serialIdentifier?: string | null;
};

export function normalizeNameSegment(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/[\s_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

/**
 * Human-facing suggestion only. The confirmed coreName remains the sole write
 * authority and changes only when the user explicitly applies this value.
 */
export function suggestCanonicalProductName(input: ProductNameSuggestionInput) {
  const primaryNoun = normalizeNameSegment(input.primaryNoun);
  if (!primaryNoun) return "";
  const segments = input.itemKind === "purchased"
    ? [primaryNoun, input.brand, input.specificationModel]
    : [primaryNoun, input.seriesCode, input.feature, input.serialIdentifier];
  return segments.map(normalizeNameSegment).filter(Boolean).join("_");
}

export type CreateResult = {
  root?: { id?: string; rootCode?: string };
  partNumber?: { id?: string; partNumber?: string };
  drawingNumber?: { id?: string; drawingNumber?: string } | null;
  reusedFromIdempotency?: boolean;
  pdmCompany?: { companyId: string; companyCode: string; displayName: string };
};

export type CreateErrorCode =
  | "validation_error"
  | "numbering_duplicate"
  | "root_not_found"
  | "root_locked"
  | "append_not_allowed"
  | "permission_denied"
  | "company_scope_mismatch"
  | "idempotency_conflict"
  | "concurrency_conflict"
  | "relation_conflict"
  | "service_unavailable";

function normalizedPartFields(intent: PartCreateFields): PartCreateFields {
  return {
    itemKind: intent.itemKind,
    isUniversal: intent.isUniversal,
    seriesCode: intent.itemKind === "manufactured" && !intent.isUniversal ? intent.seriesCode?.trim() || null : null,
    customSpecification: intent.customSpecification?.trim() || null,
  };
}

function normalizedDrawingFields(intent: DrawingCreateFields): DrawingCreateFields {
  return {
    purposeCode: intent.purposeCode,
    referencePurpose: intent.purposeCode === "R" ? intent.referencePurpose?.trim() || null : null,
  };
}

export function normalizeCreateIntent(intent: CanonicalNumberingCreateIntent): CanonicalNumberingCreateIntent {
  if (intent.scope === "new_root") {
    if (intent.content === "part") {
      return {
        ...intent,
        coreName: intent.coreName.trim(),
        ...normalizedPartFields(intent),
        itemKind: "purchased",
      };
    }
    if (intent.itemKind === "manufactured") {
      return {
        ...intent,
        coreName: intent.coreName.trim(),
        ...normalizedPartFields(intent),
        ...normalizedDrawingFields(intent),
        itemKind: "manufactured",
        purposeCode: "M",
        referencePurpose: null,
      };
    }
    return {
      ...intent,
      coreName: intent.coreName.trim(),
      ...normalizedPartFields(intent),
      ...normalizedDrawingFields(intent),
      itemKind: "purchased",
      purposeCode: "R",
      referencePurpose: intent.referencePurpose.trim(),
    };
  }

  const existingFields = { rootCode: intent.rootCode.trim(), appendReason: intent.appendReason?.trim() || null };
  if (intent.content === "drawing") {
    return { ...intent, ...existingFields, ...normalizedDrawingFields(intent) };
  }
  if (intent.content === "part") {
    return { ...intent, ...existingFields, ...normalizedPartFields(intent) };
  }
  return { ...intent, ...existingFields, ...normalizedPartFields(intent), ...normalizedDrawingFields(intent) };
}

function validatePartFields(intent: PartCreateFields, errors: string[]) {
  if (intent.seriesCode && intent.seriesCode.trim().length > 80) errors.push("系列代號不可超過 80 個字元。");
}

function validateDrawingFields(intent: DrawingCreateFields, errors: string[]) {
  if (!intent.purposeCode) errors.push("請選擇圖面用途。");
  if (intent.purposeCode === "R" && !intent.referencePurpose?.trim()) errors.push("請填寫參考圖用途。");
}

export function validateCreateIntent(intent: CanonicalNumberingCreateIntent): string[] {
  const errors: string[] = [];
  if (intent.scope === "new_root") {
    if (!intent.coreName.trim()) errors.push("請確認品名。");
    if (intent.coreName.trim().length > 300) errors.push("品名不可超過 300 個字元。");
    if (intent.itemKind === "manufactured" && intent.content !== "drawing_part") {
      errors.push("依圖製作件必須同時建立製造圖與料號。");
    }
    if (intent.itemKind === "manufactured" && intent.content === "drawing_part" && intent.purposeCode !== "M") {
      errors.push("依圖製作件必須建立製造圖 M。");
    }
    if (intent.itemKind === "purchased" && intent.content === "drawing_part" && intent.purposeCode !== "R") {
      errors.push("外購標準件只能選擇同時建立參考圖 R。");
    }
  } else if (!intent.rootCode.trim()) {
    errors.push("請選擇圖料根號。");
  }

  if (intent.content !== "drawing") validatePartFields(intent, errors);
  if (intent.content !== "part") validateDrawingFields(intent, errors);
  return errors;
}

function partRequestBody(intent: PartCreateFields) {
  return {
    itemKind: intent.itemKind,
    isUniversal: intent.isUniversal,
    ...(intent.itemKind === "manufactured" && !intent.isUniversal && intent.seriesCode ? { seriesCode: intent.seriesCode } : {}),
    ...(intent.customSpecification ? { customSpecification: intent.customSpecification } : {}),
  };
}

function drawingRequestBody(intent: DrawingCreateFields) {
  return {
    purposeCode: intent.purposeCode,
    purposeDescription: intent.referencePurpose || "",
  };
}

export function intentToRequest(intent: CanonicalNumberingCreateIntent) {
  const normalized = normalizeCreateIntent(intent);
  if (normalized.scope === "new_root") {
    return {
      endpoint: "/api/numbering/records",
      body: {
        coreName: normalized.coreName,
        ...partRequestBody(normalized),
        drawingRequested: normalized.content === "drawing_part",
        drawingPurposeCode: normalized.content === "drawing_part" ? normalized.purposeCode : undefined,
        drawingPurposeDescription: normalized.content === "drawing_part" ? normalized.referencePurpose || "" : "",
      },
    } as const;
  }

  const root = encodeURIComponent(normalized.rootCode);
  const common = {
    reason: normalized.appendReason || "",
    sourceEntrypoint: "canonical_numbering_create",
  };
  if (normalized.content === "part") {
    return {
      endpoint: `/api/numbering/roots/${root}/parts`,
      body: { ...partRequestBody(normalized), ...common },
    } as const;
  }
  if (normalized.content === "drawing") {
    return {
      endpoint: `/api/numbering/roots/${root}/drawings`,
      body: { ...drawingRequestBody(normalized), ...common },
    } as const;
  }
  return {
    endpoint: `/api/numbering/roots/${root}/drawing-part`,
    body: { ...partRequestBody(normalized), ...drawingRequestBody(normalized), ...common, linkRelationType: "auto" },
  } as const;
}

export function normalizeCreateError(status: number, body: unknown): { code: CreateErrorCode; message: string } {
  const raw = typeof body === "object" && body && "error" in body ? (body as { error?: unknown }).error : undefined;
  const source = typeof raw === "string" ? raw : raw && typeof raw === "object" && "message" in raw ? String((raw as { message?: unknown }).message ?? "") : "";
  const message = source.trim();
  if (status === 401 || status === 403) return { code: "permission_denied", message: "目前帳號沒有建立編號的權限。" };
  if (status === 404 || /NOT_FOUND/u.test(message)) return { code: "root_not_found", message: "找不到這個圖料根號，請重新選擇。" };
  if (status === 409) {
    if (/IDEMPOTENCY/u.test(message)) return { code: "idempotency_conflict", message: "同一操作的內容不同，請重新整理後再試。" };
    if (/LOCKED|OBSOLETE|MERGED/u.test(message)) return { code: "root_locked", message: "此圖料根號目前不可追加。" };
    if (/DUPLICATE|UNIQUE/u.test(message)) return { code: "numbering_duplicate", message: "相同編號或資料已存在，請重新確認。" };
    return { code: "concurrency_conflict", message: "資料剛被更新，請重新取得預估後再提交。" };
  }
  if (status >= 500) return { code: "service_unavailable", message: "服務暫時無法使用，請保留輸入後再試。" };
  if (/RELATION|PRIMARY/u.test(message)) return { code: "relation_conflict", message: "關聯條件不符合，請重新確認圖面用途。" };
  return { code: "validation_error", message: message || "請檢查欄位內容。" };
}
