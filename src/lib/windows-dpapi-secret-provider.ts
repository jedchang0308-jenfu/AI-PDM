import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const POWERSHELL = process.env.PDM_POWERSHELL_PATH?.trim() || "powershell.exe";

export class WindowsDpapiSecretError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export function isWindowsDpapiAvailable() {
  return process.platform === "win32";
}

function secretRoot() {
  const configured = process.env.PDM_WINDOWS_DPAPI_SECRET_DIR?.trim();
  if (configured) return path.resolve(configured);
  const localAppData = process.env.LOCALAPPDATA?.trim() || process.env.APPDATA?.trim();
  return path.join(localAppData || os.tmpdir(), "AI-PDM", "secret-store");
}

function safeSecretId(secretId: string) {
  const value = secretId.trim();
  if (!/^[A-Za-z0-9._-]+\.dpapi$/u.test(value)) {
    throw new WindowsDpapiSecretError("WINDOWS_DPAPI_SECRET_ID_INVALID", "Windows DPAPI secret reference 無效。");
  }
  return value;
}

function runPowerShell(script: string, input: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */
      POWERSHELL,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new WindowsDpapiSecretError("WINDOWS_DPAPI_HELPER_UNAVAILABLE", error.message)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new WindowsDpapiSecretError("WINDOWS_DPAPI_HELPER_FAILED", `Windows DPAPI helper failed (${code ?? "unknown"})${stderr.trim() ? `: ${stderr.trim().slice(0, 200)}` : ""}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.end(input, "utf8");
  });
}

async function protect(value: string) {
  if (!isWindowsDpapiAvailable()) throw new WindowsDpapiSecretError("WINDOWS_DPAPI_UNAVAILABLE", "目前執行環境不是 Windows，無法使用本機安全保管庫。");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    "$raw = [Console]::In.ReadToEnd().Trim()",
    "if ([string]::IsNullOrWhiteSpace($raw)) { throw 'EMPTY_SECRET' }",
    "$bytes = [Text.Encoding]::UTF8.GetBytes($raw)",
    "$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Convert]::ToBase64String($protected)"
  ].join("; ");
  return runPowerShell(script, value);
}

async function unprotect(ciphertext: string) {
  if (!isWindowsDpapiAvailable()) throw new WindowsDpapiSecretError("WINDOWS_DPAPI_UNAVAILABLE", "目前執行環境不是 Windows，無法使用本機安全保管庫。");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    "$raw = [Console]::In.ReadToEnd().Trim()",
    "$cipher = [Convert]::FromBase64String($raw)",
    "$plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Text.Encoding]::UTF8.GetString($plain)"
  ].join("; ");
  return runPowerShell(script, ciphertext);
}

async function applyAcl(filePath: string) {
  const username = process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME;
  if (!username) throw new WindowsDpapiSecretError("WINDOWS_DPAPI_ACCOUNT_UNAVAILABLE", "無法解析 Windows secret store 的執行帳號。");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("icacls.exe", [filePath, "/inheritance:r", "/grant:r", `${username}:(F)`], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new WindowsDpapiSecretError("WINDOWS_DPAPI_ACL_FAILED", error.message)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new WindowsDpapiSecretError("WINDOWS_DPAPI_ACL_FAILED", `Windows secret ACL failed (${code ?? "unknown"})${stderr.trim() ? `: ${stderr.trim().slice(0, 200)}` : ""}`));
    });
  });
}

export async function writeWindowsDpapiSecret(kind: string, value: string) {
  if (!isWindowsDpapiAvailable()) throw new WindowsDpapiSecretError("WINDOWS_DPAPI_UNAVAILABLE", "目前執行環境不是 Windows，無法使用本機安全保管庫。");
  const root = secretRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const secretId = `${kind}-${cryptoRandomId()}.dpapi`;
  const finalPath = path.join(root, secretId);
  const tempPath = `${finalPath}.tmp-${cryptoRandomId()}`;
  try {
    const ciphertext = await protect(value.trim());
    await writeFile(tempPath, `${ciphertext}\n`, { encoding: "ascii", mode: 0o600, flag: "wx" });
    await rename(tempPath, finalPath);
    await applyAcl(finalPath);
    return { secretId, storageBoundary: "windows_dpapi_current_user_encrypted_blob" as const };
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    await rm(finalPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readWindowsDpapiSecret(secretId: string) {
  const safeId = safeSecretId(secretId);
  const filePath = path.join(secretRoot(), safeId);
  const ciphertext = (await readFile(filePath, "utf8")).trim();
  if (!ciphertext) throw new WindowsDpapiSecretError("WINDOWS_DPAPI_SECRET_EMPTY", "Windows DPAPI secret reference 沒有內容。");
  const value = (await unprotect(ciphertext)).trim();
  if (!value) throw new WindowsDpapiSecretError("WINDOWS_DPAPI_SECRET_EMPTY", "Windows DPAPI secret reference 解密後沒有內容。");
  return value;
}

function cryptoRandomId() {
  return randomUUID();
}
