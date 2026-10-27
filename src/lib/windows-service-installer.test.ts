import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWindowsServiceInstaller, WindowsServiceInstallerError } from "./windows-service-installer";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(overrides: Record<string, unknown> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aipdm-dev125-installer-"));
  roots.push(root);
  const directory = path.join(root, "worker-downloads", "windows-service");
  await fs.mkdir(directory, { recursive: true });
  const bytes = Buffer.from("MZ\u0000dev125-fixture", "utf8");
  const fileName = "AI-PDM-Windows-Setup-0.1.0.exe";
  await fs.writeFile(path.join(directory, fileName), bytes);
  const manifest = {
    contractVersion: "ai-pdm.windows-service-installer.v1",
    sourceRevision: "a".repeat(40),
    version: "0.1.0",
    protocolVersion: 1,
    fileName,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    ...overrides
  };
  await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest), "utf8");
  return { root, directory, fileName };
}

describe("DEV-125 Windows installer reader", () => {
  it("returns only the exact manifest-bound bytes", async () => {
    const created = await fixture();
    const result = await readWindowsServiceInstaller(created.root);
    expect(result.manifest.sourceRevision).toBe("a".repeat(40));
    expect(result.bytes.toString("utf8")).toContain("dev125-fixture");
  });

  it("fails closed for extra manifest fields, path-shaped names, and digest drift", async () => {
    const extra = await fixture({ downloadUrl: "https://example.invalid/installer.exe" });
    await expect(readWindowsServiceInstaller(extra.root)).rejects.toMatchObject({
      code: "INSTALLER_UNAVAILABLE", status: 503
    } satisfies Partial<WindowsServiceInstallerError>);

    const pathShaped = await fixture({ fileName: "../AI-PDM-Windows-Setup-0.1.0.exe" });
    await expect(readWindowsServiceInstaller(pathShaped.root)).rejects.toMatchObject({ code: "INSTALLER_UNAVAILABLE" });

    const drifted = await fixture();
    await fs.appendFile(path.join(drifted.directory, drifted.fileName), "tamper");
    await expect(readWindowsServiceInstaller(drifted.root)).rejects.toMatchObject({ code: "INSTALLER_UNAVAILABLE" });
  });
});
