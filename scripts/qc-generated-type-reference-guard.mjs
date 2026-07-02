import fs from "node:fs";
import { projectFileExists, projectPath, readProjectFile } from "./qc-project-file-utils.mjs";

export function createGeneratedTypeReferenceGuard(root, record) {
  const generatedTypeReferencePath = projectPath(root, "next-env.d.ts");
  const generatedTypeReferenceSnapshot = projectFileExists(root, "next-env.d.ts")
    ? readProjectFile(root, "next-env.d.ts")
    : null;

  return function restoreGeneratedTypeReference() {
    if (generatedTypeReferenceSnapshot === null) return;
    const current = projectFileExists(root, "next-env.d.ts")
      ? readProjectFile(root, "next-env.d.ts")
      : null;
    if (current === generatedTypeReferenceSnapshot) return;
    fs.writeFileSync(generatedTypeReferencePath, generatedTypeReferenceSnapshot);
    record("restore generated type reference", true, "next-env.d.ts");
  };
}
