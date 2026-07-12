import path from "node:path";
import {
  createFileStorageServiceForPointer,
  createReleasePackageStorageService,
  getReleasePackageRoot,
  storagePointerFromRecord,
  storageKeyFromLocalPath
} from "@/lib/file-storage";
import type { ReleasePackage } from "@/lib/types";

type ReleasePackagePointerInput = Pick<ReleasePackage, "local_path" | "storage_provider" | "storage_bucket" | "storage_key">;

export function resolveReleasePackagePath(releasePackage: Pick<ReleasePackage, "local_path">) {
  const packageRoot = path.resolve(/*turbopackIgnore: true*/ getReleasePackageRoot());
  const packagePath = path.resolve(/*turbopackIgnore: true*/ releasePackage.local_path);
  if (!packagePath.startsWith(packageRoot + path.sep)) {
    throw new Error("RELEASE_PACKAGE_PATH_OUTSIDE_ROOT");
  }
  return packagePath;
}

export async function readReleasePackage(releasePackage: ReleasePackagePointerInput) {
  const pointer = getReleasePackageStoragePointer(releasePackage);
  if (pointer.provider === "local_repository") return createReleasePackageStorageService().readObject(pointer.key);
  return createFileStorageServiceForPointer(pointer).readObject(pointer.key);
}

export function getReleasePackageStoragePointer(releasePackage: ReleasePackagePointerInput) {
  if (releasePackage.storage_key || releasePackage.storage_provider) {
    return storagePointerFromRecord(releasePackage, getReleasePackageRoot());
  }
  return {
    provider: "local_repository" as const,
    bucket: null,
    key: storageKeyFromLocalPath(resolveReleasePackagePath(releasePackage), getReleasePackageRoot()),
    legacyLocalPath: releasePackage.local_path
  };
}

export function getReleasePackageStorageKey(releasePackage: ReleasePackagePointerInput) {
  return getReleasePackageStoragePointer(releasePackage).key;
}

export function createReleasePackageStorageServiceForRecord(releasePackage: ReleasePackagePointerInput) {
  const pointer = getReleasePackageStoragePointer(releasePackage);
  if (pointer.provider === "local_repository") return createReleasePackageStorageService();
  return createFileStorageServiceForPointer(pointer);
}

export function contentDispositionFilename(filename: string) {
  return filename.replace(/["\r\n\\]/g, "_");
}
