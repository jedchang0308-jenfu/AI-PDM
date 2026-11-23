export function normalizeMediaType(value: string | null | undefined): string {
  return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}

/** A legacy PDF candidate still requires content validation at the byte reader. */
export function isPdfMediaCandidate(extension: string, mimeType: string | null | undefined): boolean {
  const mime = normalizeMediaType(mimeType);
  return extension.trim().replace(/^\./u, "").toLowerCase() === "pdf"
    && ["", "application/pdf", "application/octet-stream"].includes(mime);
}
