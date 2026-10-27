import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class WindowsServiceInstallerError extends Error {
  constructor(readonly code = "INSTALLER_UNAVAILABLE", readonly status = 503) { super(code); }
}

type InstallerManifest = {
  contractVersion: "ai-pdm.windows-service-installer.v1";
  sourceRevision: string;
  version: string;
  protocolVersion: 1;
  fileName: string;
  sha256: string;
  size: number;
};

const manifestKeys = ["contractVersion", "sourceRevision", "version", "protocolVersion", "fileName", "sha256", "size"];

export async function readWindowsServiceInstaller(root = process.cwd()) {
  const directory = path.join(root, "worker-downloads", "windows-service");
  try {
    const raw = await fs.readFile(path.join(directory, "manifest.json"), "utf8");
    if (Buffer.byteLength(raw, "utf8") > 8 * 1024) throw new Error("MANIFEST_TOO_LARGE");
    const manifest = JSON.parse(raw) as InstallerManifest;
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) ||
        Object.keys(manifest).length !== manifestKeys.length || manifestKeys.some((key) => !(key in manifest)) ||
        manifest.contractVersion !== "ai-pdm.windows-service-installer.v1" ||
        manifest.protocolVersion !== 1 || !/^[0-9A-Za-z._-]{1,40}$/u.test(manifest.version) ||
        !/^[a-f0-9]{40}$/u.test(manifest.sourceRevision) ||
        !/^AI-PDM-Windows-Setup-[0-9A-Za-z._-]{1,40}\.exe$/u.test(manifest.fileName) ||
        !/^[a-f0-9]{64}$/u.test(manifest.sha256) ||
        !Number.isSafeInteger(manifest.size) || manifest.size < 1 || manifest.size > 256 * 1024 * 1024) {
      throw new Error("MANIFEST_INVALID");
    }
    const filePath = path.join(directory, manifest.fileName);
    if (path.dirname(filePath) !== directory) throw new Error("INSTALLER_PATH_INVALID");
    const bytes = await fs.readFile(filePath);
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== manifest.size || digest !== manifest.sha256) throw new Error("INSTALLER_DIGEST_INVALID");
    return { manifest, bytes };
  } catch (error) {
    if (error instanceof WindowsServiceInstallerError) throw error;
    throw new WindowsServiceInstallerError();
  }
}
