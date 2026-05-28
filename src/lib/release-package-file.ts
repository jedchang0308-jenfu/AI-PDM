import fs from "node:fs/promises";
import path from "node:path";
import type { ReleasePackage } from "@/lib/types";

export function getReleasePackageRoot() {
  const configured = process.env.PDM_DATA_DIR?.trim();
  const dataDir = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.join(/*turbopackIgnore: true*/ process.cwd(), configured)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  return path.join(/*turbopackIgnore: true*/ dataDir, "release-packages");
}

export function resolveReleasePackagePath(releasePackage: Pick<ReleasePackage, "local_path">) {
  const packageRoot = path.resolve(/*turbopackIgnore: true*/ getReleasePackageRoot());
  const packagePath = path.resolve(/*turbopackIgnore: true*/ releasePackage.local_path);
  if (!packagePath.startsWith(packageRoot + path.sep)) {
    throw new Error("RELEASE_PACKAGE_PATH_OUTSIDE_ROOT");
  }
  return packagePath;
}

export async function readReleasePackage(releasePackage: Pick<ReleasePackage, "local_path">) {
  return fs.readFile(resolveReleasePackagePath(releasePackage));
}

export function contentDispositionFilename(filename: string) {
  return filename.replace(/["\r\n\\]/g, "_");
}
