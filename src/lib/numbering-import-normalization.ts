export function canonicalImportedRootName(coreName: string, partName: string) {
  const rootName = coreName.trim();
  const candidatePartName = partName.trim();
  if (!rootName) return candidatePartName;
  if (!candidatePartName) return rootName;
  if (candidatePartName === rootName) return rootName;
  if (candidatePartName.startsWith(rootName) && candidatePartName.length > rootName.length) return candidatePartName;
  return rootName;
}

export function importedPartSequence(partNumber: string) {
  const v3 = partNumber.match(/^[A-Z][0-9]{4}-P([0-9]{2})$/);
  if (v3) return Number.parseInt(v3[1], 10);
  const v2 = partNumber.match(/^[0-9]{5}-P([0-9]{2})$/);
  if (v2) return Number.parseInt(v2[1], 10);
  const v1 = partNumber.match(/(\d{3})$/);
  return v1 ? Number.parseInt(v1[1], 10) : 0;
}

export function importedDrawingSequence(drawingNumber: string) {
  const v3 = drawingNumber.match(/^[A-Z][0-9]{4}-[MR]([0-9]{2})$/);
  if (v3) return Number.parseInt(v3[1], 10);
  const v2 = drawingNumber.match(/^[0-9]{5}-[MR]([0-9]{2})$/);
  if (v2) return Number.parseInt(v2[1], 10);
  const v1 = drawingNumber.match(/(?:MA|OT)(\d)$/);
  return v1 ? Number.parseInt(v1[1], 10) : 1;
}
