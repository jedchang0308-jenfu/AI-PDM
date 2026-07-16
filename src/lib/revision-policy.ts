export type RevisionLifecycleStage = "rd_workspace" | "release_area" | "design_change_workspace";
export type RevisionKind = "major" | "minor";

export type RevisionHistorySource = {
  revision: string;
  status?: string | null;
  releasedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ParsedRevision = {
  code: string;
  kind: RevisionKind;
  major: number;
  minor: number | null;
};

const majorRevisionPattern = /^[1-9]\d*$/u;
const minorRevisionPattern = /^(0|[1-9]\d*)\.([1-9]\d*)$/u;
const legacyAlphaRevisionPattern = /^[A-Z]$/u;

export function normalizeRevisionCode(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/gu, "");
}

export function parseRevisionCode(value: string | null | undefined, options: { allowLegacy?: boolean } = {}): ParsedRevision | null {
  let code = normalizeRevisionCode(value);
  if (!code) return null;

  if (options.allowLegacy && /^v\d/iu.test(code)) {
    code = code.slice(1);
  }

  if (options.allowLegacy && legacyAlphaRevisionPattern.test(code.toUpperCase())) {
    const major = code.toUpperCase().charCodeAt(0) - 64;
    return { code: String(major), kind: "major", major, minor: null };
  }

  if (majorRevisionPattern.test(code)) {
    return { code, kind: "major", major: Number(code), minor: null };
  }

  const minorMatch = code.match(minorRevisionPattern);
  if (minorMatch) {
    return {
      code,
      kind: "minor",
      major: Number(minorMatch[1]),
      minor: Number(minorMatch[2])
    };
  }

  return null;
}

export function validateRevisionCode(
  value: string | null | undefined,
  options: { lifecycleStage?: RevisionLifecycleStage; required?: boolean } = {}
) {
  const code = normalizeRevisionCode(value);
  if (!code) return options.required === false ? null : "REVISION_REQUIRED";
  if (/^v/iu.test(code)) return "REVISION_V_PREFIX_NOT_ALLOWED";
  if (/[A-Za-z]/u.test(code)) return "REVISION_MUST_BE_NUMERIC";

  const parsed = parseRevisionCode(code);
  if (!parsed) return "REVISION_FORMAT_INVALID";
  if (options.lifecycleStage === "release_area" && parsed.kind !== "major") return "REVISION_RELEASE_REQUIRES_MAJOR";
  if ((options.lifecycleStage === "rd_workspace" || options.lifecycleStage === "design_change_workspace") && parsed.kind !== "minor") {
    return "REVISION_WORKSPACE_REQUIRES_MINOR";
  }

  return null;
}

export function isValidRevisionCode(value: string | null | undefined, options: { lifecycleStage?: RevisionLifecycleStage } = {}) {
  return validateRevisionCode(value, options) === null;
}

export function compareRevisionCodes(left: string | null | undefined, right: string | null | undefined, options: { allowLegacy?: boolean } = {}) {
  const leftRevision = parseRevisionCode(left, options);
  const rightRevision = parseRevisionCode(right, options);
  if (!leftRevision || !rightRevision) {
    throw new Error(`版次格式無法比較：${normalizeRevisionCode(left) || "-"} / ${normalizeRevisionCode(right) || "-"}。請通知 Admin 修正版本資料後再處理。`);
  }
  if (leftRevision.major !== rightRevision.major) return leftRevision.major - rightRevision.major;
  return (leftRevision.minor ?? 0) - (rightRevision.minor ?? 0);
}

export function suggestRevisionCode(revisions: RevisionHistorySource[], lifecycleStage: RevisionLifecycleStage = "release_area") {
  const parsed = revisions
    .map((revision) => {
      const parsedRevision = parseRevisionCode(revision.revision, { allowLegacy: true });
      return parsedRevision ? { ...parsedRevision, status: revision.status ?? null } : null;
    })
    .filter((revision): revision is ParsedRevision & { status: string | null } => Boolean(revision));

  if (lifecycleStage === "rd_workspace") {
    const nextMinor =
      Math.max(
        0,
        ...parsed.filter((revision) => revision.kind === "minor" && revision.major === 0).map((revision) => revision.minor ?? 0)
      ) + 1;
    return `0.${nextMinor}`;
  }

  if (lifecycleStage === "design_change_workspace") {
    const releasedMajor = Math.max(
      0,
      ...parsed
        .filter((revision) => revision.kind === "major" && revision.status === "Released")
        .map((revision) => revision.major)
    );
    const activeMajor = releasedMajor || Math.max(1, ...parsed.map((revision) => revision.major));
    const nextMinor =
      Math.max(
        0,
        ...parsed
          .filter((revision) => revision.kind === "minor" && revision.major === activeMajor)
          .map((revision) => revision.minor ?? 0)
      ) + 1;
    return `${activeMajor}.${nextMinor}`;
  }

  const maxMajor = Math.max(0, ...parsed.map((revision) => revision.major));
  return String(Math.max(1, maxMajor + 1));
}

export function revisionValidationMessage(code: string) {
  switch (code) {
    case "REVISION_REQUIRED":
      return "版次為必填。";
    case "REVISION_V_PREFIX_NOT_ALLOWED":
      return "版次請填數字，不要加 V。";
    case "REVISION_MUST_BE_NUMERIC":
      return "版次請使用數字格式，例如 1、2、0.1 或 1.1。";
    case "REVISION_RELEASE_REQUIRES_MAJOR":
      return "發行區版次需使用大版次，例如 1、2、3。";
    case "REVISION_WORKSPACE_REQUIRES_MINOR":
      return "工作區版次需使用小版次，例如 0.1、0.2 或 1.1。";
    default:
      return "版次格式需為大版次 1、2、3，或小版次 0.1、1.1；不可包含 V。";
  }
}
