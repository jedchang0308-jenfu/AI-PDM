export type RevisionPackageFileRole = "cad_3d" | "drawing_2d" | "intermediate" | "pdf" | "dwg_dxf" | "other";

export type RevisionPackageWarningCode =
  | "missing_pdf"
  | "missing_dwg_dxf"
  | "missing_3d_cad"
  | "unknown_file_role"
  | "filename_revision_mismatch"
  | "duplicate_category";

export type RevisionPackageClassifiedFile = {
  id?: string;
  filename: string;
  defaultRole: RevisionPackageFileRole;
  role: RevisionPackageFileRole;
  source: "extension" | "user";
};

export type RevisionPackageWarning = {
  code: RevisionPackageWarningCode;
  severity: "warning";
  affectedFileIds?: string[];
  messageForSubmitter: string;
  messageForReviewer: string;
};

export const revisionPackageRoleOptions: Array<{ value: RevisionPackageFileRole; label: string }> = [
  { value: "drawing_2d", label: "2D 圖面" },
  { value: "cad_3d", label: "3D CAD" },
  { value: "intermediate", label: "中繼檔" },
  { value: "pdf", label: "PDF" },
  { value: "dwg_dxf", label: "DWG/DXF" },
  { value: "other", label: "其他" }
];

const validRoles = new Set<RevisionPackageFileRole>(revisionPackageRoleOptions.map((option) => option.value));
const cad3dExtensions = new Set(["sldprt", "sldasm"]);
const drawing2dExtensions = new Set(["slddrw"]);
const intermediateExtensions = new Set(["step", "stp", "iges", "igs", "igf", "x_t", "x_b", "sat", "stl", "jt"]);
const dwgDxfExtensions = new Set(["dwg", "dxf"]);

export function normalizeRevisionPackageFileRole(value: unknown): RevisionPackageFileRole | null {
  const text = String(value ?? "").trim();
  return validRoles.has(text as RevisionPackageFileRole) ? (text as RevisionPackageFileRole) : null;
}

export function classifyRevisionPackageFiles(
  files: Array<{
    id?: string;
    filename: string;
    mimeType?: string | null;
    documentCategory?: string | null;
    userCorrectedRole?: RevisionPackageFileRole | null;
  }>
): RevisionPackageClassifiedFile[] {
  return files.map((file) => {
    const defaultRole = inferRevisionPackageRole(file.filename, file.documentCategory);
    const corrected = normalizeRevisionPackageFileRole(file.userCorrectedRole);
    return {
      id: file.id,
      filename: file.filename,
      defaultRole,
      role: corrected ?? defaultRole,
      source: corrected && corrected !== defaultRole ? "user" : "extension"
    };
  });
}

export function inferRevisionPackageRole(filename: string, documentCategory?: string | null): RevisionPackageFileRole {
  const extension = getFileExtension(filename);
  if (cad3dExtensions.has(extension)) return "cad_3d";
  if (drawing2dExtensions.has(extension)) return "drawing_2d";
  if (intermediateExtensions.has(extension)) return "intermediate";
  if (extension === "pdf") return "pdf";
  if (dwgDxfExtensions.has(extension)) return "dwg_dxf";

  if (documentCategory === "cad_3d") return "cad_3d";
  if (documentCategory === "drawing_2d") return "drawing_2d";
  if (documentCategory === "pdf") return "pdf";
  if (documentCategory === "dwg") return "dwg_dxf";
  return "other";
}

export function revisionPackageRoleLabel(role: string) {
  return revisionPackageRoleOptions.find((option) => option.value === role)?.label ?? role;
}

export function revisionPackageRoleToDocumentCategory(role: RevisionPackageFileRole): "cad_3d" | "drawing_2d" | "dwg" | "pdf" | "other" {
  if (role === "cad_3d" || role === "drawing_2d" || role === "pdf") return role;
  if (role === "dwg_dxf") return "dwg";
  return "other";
}

export function evaluateRevisionPackageCompleteness(input: {
  drawingNumber: string;
  revision: string;
  files: Array<{
    id?: string;
    filename: string;
    role: RevisionPackageFileRole;
  }>;
}): RevisionPackageWarning[] {
  if (input.files.length === 0) return [];

  const warnings: RevisionPackageWarning[] = [];
  const roles = new Set(input.files.map((file) => file.role));
  const byRole = new Map<RevisionPackageFileRole, Array<{ id?: string; filename: string; role: RevisionPackageFileRole }>>();
  for (const file of input.files) {
    byRole.set(file.role, [...(byRole.get(file.role) ?? []), file]);
  }

  if (!roles.has("pdf")) {
    warnings.push({
      code: "missing_pdf",
      severity: "warning",
      messageForSubmitter: "此版次缺少 PDF，仍可送審；審核者會看到此提醒。",
      messageForReviewer: "此版次缺少 PDF，系統不阻擋送審，但審核者需確認是否可接受。"
    });
  }
  if (!roles.has("dwg_dxf")) {
    warnings.push({
      code: "missing_dwg_dxf",
      severity: "warning",
      messageForSubmitter: "此版次缺少 DWG/DXF，若需加工交接，建議補件後送審。",
      messageForReviewer: "此版次缺少 DWG/DXF，若需加工交接，請確認是否需退回補件。"
    });
  }
  if (!roles.has("cad_3d")) {
    warnings.push({
      code: "missing_3d_cad",
      severity: "warning",
      messageForSubmitter: "此版次未包含 3D CAD，仍可送審；請確認本次變更是否需要 3D 依據。",
      messageForReviewer: "此版次未包含 3D CAD，請確認 2D/PDF/DWG 是否足以審核。"
    });
  }

  const unknownFiles = byRole.get("other") ?? [];
  if (unknownFiles.length > 0) {
    warnings.push({
      code: "unknown_file_role",
      severity: "warning",
      affectedFileIds: unknownFiles.map((file) => file.id).filter((id): id is string => Boolean(id)),
      messageForSubmitter: "有檔案類別無法判定，請確認分類。",
      messageForReviewer: "有檔案類別由送審者手動確認，請留意是否合理。"
    });
  }

  for (const [role, roleFiles] of byRole.entries()) {
    if (role !== "other" && roleFiles.length > 1) {
      warnings.push({
        code: "duplicate_category",
        severity: "warning",
        affectedFileIds: roleFiles.map((file) => file.id).filter((id): id is string => Boolean(id)),
        messageForSubmitter: `此版次有多個${revisionPackageRoleLabel(role)}檔案，請確認哪個是主要依據。`,
        messageForReviewer: `此版次有多個${revisionPackageRoleLabel(role)}檔案，請確認主要審核依據。`
      });
    }
  }

  const revisionHints = input.revision ? [input.revision, input.revision.replace(/\./g, "")] : [];
  const suspiciousFiles = revisionHints.length
    ? input.files.filter((file) => {
        const normalized = file.filename.toLowerCase();
        return /rev|版次|v\d|[_-]r\d/u.test(normalized) && !revisionHints.some((hint) => normalized.includes(hint.toLowerCase()));
      })
    : [];
  if (suspiciousFiles.length > 0) {
    warnings.push({
      code: "filename_revision_mismatch",
      severity: "warning",
      affectedFileIds: suspiciousFiles.map((file) => file.id).filter((id): id is string => Boolean(id)),
      messageForSubmitter: "檔名或內容看起來可能不是本次版次，請確認後再送審。",
      messageForReviewer: "檔名或內容可能與本次版次不一致，請確認是否退回。"
    });
  }

  return warnings;
}

function getFileExtension(filename: string) {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > 0 && index < normalized.length - 1 ? normalized.slice(index + 1) : "";
}
