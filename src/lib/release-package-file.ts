import path from "node:path";
import {
  createReleasePackageStorageService,
  getReleasePackageRoot,
  storageKeyFromLocalPath
} from "@/lib/file-storage";
import type { ReleasePackage } from "@/lib/types";

export function resolveReleasePackagePath(releasePackage: Pick<ReleasePackage, "local_path">) {
  const packageRoot = path.resolve(/*turbopackIgnore: true*/ getReleasePackageRoot());
  const packagePath = path.resolve(/*turbopackIgnore: true*/ releasePackage.local_path);
  if (!packagePath.startsWith(packageRoot + path.sep)) {
    throw new Error("RELEASE_PACKAGE_PATH_OUTSIDE_ROOT");
  }
  return packagePath;
}

export async function readReleasePackage(releasePackage: Pick<ReleasePackage, "local_path">) {
  const storageKey = getReleasePackageStorageKey(releasePackage);
  return createReleasePackageStorageService().readObject(storageKey);
}

export function getReleasePackageStorageKey(releasePackage: Pick<ReleasePackage, "local_path">) {
  return storageKeyFromLocalPath(resolveReleasePackagePath(releasePackage), getReleasePackageRoot());
}

export function contentDispositionFilename(filename: string) {
  return filename.replace(/["\r\n\\]/g, "_");
}
