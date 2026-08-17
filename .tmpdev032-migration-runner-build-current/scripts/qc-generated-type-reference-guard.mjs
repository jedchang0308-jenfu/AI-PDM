import fs from "node:fs";
import { projectFileExists, projectPath, readProjectFile } from "./qc-project-file-utils.mjs";

export function createGeneratedTypeReferenceGuard(root, record) {
  const guardedRelativePaths = ["next-env.d.ts", "tsconfig.json"];
  const snapshots = guardedRelativePaths.map((relativePath) => ({
    relativePath,
    absolutePath: projectPath(root, relativePath),
    content: projectFileExists(root, relativePath) ? readProjectFile(root, relativePath) : null
  }));

  return function restoreGeneratedTypeReference() {
    for (const snapshot of snapshots) {
      const current = projectFileExists(root, snapshot.relativePath) ? readProjectFile(root, snapshot.relativePath) : null;
      if (current === snapshot.content) continue;
      if (snapshot.content === null) {
        fs.rmSync(snapshot.absolutePath, { force: true });
      } else {
        fs.writeFileSync(snapshot.absolutePath, snapshot.content);
      }
      record("restore generated type reference", true, snapshot.relativePath);
    }
  };
}
