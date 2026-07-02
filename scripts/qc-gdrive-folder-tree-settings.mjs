#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-gdrive-tree-"));
const demoPassword = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const mockToken = "mock-drive-token";
const results = [];
const read = (relativePath) => readProjectFile(root, relativePath);

const folders = {
  "folder-ai-pdm": {
    id: "folder-ai-pdm",
    name: "AI_PDM",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["root"],
    driveId: "shared-drive-1",
    capabilities: { canAddChildren: true, canEdit: true, canShare: true }
  },
  "folder-pending": {
    id: "folder-pending",
    name: "00_Pending",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["folder-ai-pdm"],
    driveId: "shared-drive-1",
    capabilities: { canAddChildren: true, canEdit: true, canShare: true }
  },
  "folder-released": {
    id: "folder-released",
    name: "10_Released",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["folder-ai-pdm"],
    driveId: "shared-drive-1",
    capabilities: { canAddChildren: true, canEdit: true, canShare: true }
  },
  "file-not-folder": {
    id: "file-not-folder",
    name: "not-a-folder.pdf",
    mimeType: "application/pdf",
    parents: ["folder-ai-pdm"],
    driveId: "shared-drive-1",
    capabilities: { canAddChildren: false, canEdit: true, canShare: true }
  }
};

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error("Unable to allocate local port"));
        else resolve(port);
      });
    });
  });
}

function withWebViewLink(folder) {
  return {
    ...folder,
    webViewLink: `https://drive.google.com/drive/folders/${folder.id}`
  };
}

function startMockDrive() {
  const state = { requests: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    state.requests.push({
      method: req.method,
      path: url.pathname,
      search: url.search,
      authorization: req.headers.authorization ?? ""
    });

    if (req.method === "GET" && url.pathname === "/drive/v3/files") {
      const q = url.searchParams.get("q") ?? "";
      const parentMatch = q.match(/'([^']+)' in parents/);
      const parentId = parentMatch?.[1] ?? "root";
      const files = Object.values(folders)
        .filter((folder) => folder.parents.includes(parentId))
        .filter((folder) => folder.mimeType === "application/vnd.google-apps.folder")
        .map(withWebViewLink);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ files }));
      return;
    }

    const fileMatch = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (req.method === "GET" && fileMatch) {
      const id = decodeURIComponent(fileMatch[1]);
      const folder = folders[id];
      if (!folder) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(withWebViewLink(folder)));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Unhandled mock route ${req.method} ${url.pathname}` }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Mock Drive server did not expose an address"));
        return;
      }
      resolve({ server, state, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function startApp(port, driveBaseUrl) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      GOOGLE_DRIVE_API_BASE_URL: `${driveBaseUrl}/drive/v3`,
      GOOGLE_DRIVE_UPLOAD_BASE_URL: `${driveBaseUrl}/upload/drive/v3`,
      GOOGLE_DRIVE_MOCK_ACCESS_TOKEN: mockToken
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { child, getOutput: () => output };
}

async function stopApp(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    })
  ]);
}

async function waitForApp(baseUrl, getOutput) {
  const deadline = Date.now() + 30000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  throw new Error(`App did not become ready: ${lastError}\n${getOutput()}`);
}

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: demoPassword })
  });
  record(`Login ${email}`, response.ok, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function verifyApi(baseUrl, adminCookie, engineerCookie, mockState) {
  const rootResponse = await fetch(`${baseUrl}/api/settings/gdrive/folders?parentId=root`, { headers: { cookie: adminCookie } });
  const rootBody = await rootResponse.json();
  record("Admin folder children API returns 200", rootResponse.status === 200, JSON.stringify(rootBody));
  record("Children API returns folders only", rootBody.folders?.length === 1 && rootBody.folders[0].id === "folder-ai-pdm", JSON.stringify(rootBody.folders));

  const request = mockState.requests.find((entry) => entry.path === "/drive/v3/files" && entry.search.includes("root"));
  record("Children API uses supportsAllDrives", request?.search.includes("supportsAllDrives=true") === true, request?.search ?? "");
  record("Children API uses includeItemsFromAllDrives", request?.search.includes("includeItemsFromAllDrives=true") === true, request?.search ?? "");

  const engineerResponse = await fetch(`${baseUrl}/api/settings/gdrive/folders?parentId=root`, { headers: { cookie: engineerCookie } });
  record("Engineer folder children API is forbidden", engineerResponse.status === 403, `HTTP ${engineerResponse.status}`);

  const verifyPending = await fetch(`${baseUrl}/api/settings/gdrive/folders/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ folderId: "folder-pending", intendedUse: "pending" })
  });
  const verifyPendingBody = await verifyPending.json();
  record("Verify API returns 200 for folder", verifyPending.status === 200, JSON.stringify(verifyPendingBody));
  record("Verify API returns path snapshot", verifyPendingBody.folder?.path?.includes("AI_PDM / 00_Pending") === true, verifyPendingBody.folder?.path ?? "");
  record("Verify API returns can upload", verifyPendingBody.capabilities?.canUpload === true, JSON.stringify(verifyPendingBody.capabilities));

  const verifyFile = await fetch(`${baseUrl}/api/settings/gdrive/folders/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ folderId: "file-not-folder", intendedUse: "pending" })
  });
  record("Verify API rejects non-folder target", verifyFile.status === 400, `HTTP ${verifyFile.status}`);

  const sameFolder = await fetch(`${baseUrl}/api/settings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      gdrive_pending_folder_id: "folder-pending",
      gdrive_pending_folder_name: "00_Pending",
      gdrive_pending_folder_path: verifyPendingBody.folder.path,
      gdrive_pending_folder_verified_at: verifyPendingBody.verifiedAt,
      gdrive_released_folder_id: "folder-pending",
      gdrive_released_folder_name: "00_Pending",
      gdrive_released_folder_path: verifyPendingBody.folder.path,
      gdrive_released_folder_verified_at: verifyPendingBody.verifiedAt,
      gdrive_require_verified: true
    })
  });
  record("Settings API rejects same pending/released folder", sameFolder.status === 400, `HTTP ${sameFolder.status}`);

  const verifyReleased = await fetch(`${baseUrl}/api/settings/gdrive/folders/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ folderId: "folder-released", intendedUse: "released" })
  });
  const verifyReleasedBody = await verifyReleased.json();
  record("Verify API returns 200 for released folder", verifyReleased.status === 200, JSON.stringify(verifyReleasedBody));

  const saveResponse = await fetch(`${baseUrl}/api/settings`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      gdrive_pending_folder_id: "folder-pending",
      gdrive_pending_folder_name: "00_Pending",
      gdrive_pending_folder_path: verifyPendingBody.folder.path,
      gdrive_pending_folder_verified_at: verifyPendingBody.verifiedAt,
      gdrive_released_folder_id: "folder-released",
      gdrive_released_folder_name: "10_Released",
      gdrive_released_folder_path: verifyReleasedBody.folder.path,
      gdrive_released_folder_verified_at: verifyReleasedBody.verifiedAt,
      gdrive_require_verified: true
    })
  });
  const saveBody = await saveResponse.json();
  record("Settings API saves verified folders", saveResponse.status === 200, JSON.stringify(saveBody));

  const settingsResponse = await fetch(`${baseUrl}/api/settings`, { headers: { cookie: adminCookie } });
  const settingsBody = await settingsResponse.json();
  record("Settings GET returns pending metadata snapshot", settingsBody.settings?.gdrive_pending_folder_path?.includes("AI_PDM / 00_Pending") === true);
  record("Settings GET returns released metadata snapshot", settingsBody.settings?.gdrive_released_folder_path?.includes("AI_PDM / 10_Released") === true);
}

async function verifyUi(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { width: 1440, height: 1100 },
      { width: 390, height: 920 }
    ]) {
      const context = await browser.newContext({ viewport });
      const consoleErrors = [];
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));

      const adminCookie = await login(baseUrl, "admin@example.com");
      const [name, ...valueParts] = adminCookie.split("=");
      const url = new URL(baseUrl);
      await context.addCookies([{ name, value: valueParts.join("="), domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);

      await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });
      await page.locator("[data-testid='gdrive-folder-tree']").waitFor({ timeout: 15000 });
      record(`Settings renders folder tree at ${viewport.width}px`, await page.locator("[data-testid='gdrive-folder-tree']").isVisible());
      record(`Settings renders folder detail at ${viewport.width}px`, await page.locator("[data-testid='gdrive-folder-detail']").isVisible());

      if (viewport.width > 600) {
        await page.getByLabel("AI_PDM 展開").click();
        await page.getByText("00_Pending").first().waitFor({ timeout: 10000 });
        await page.getByText("00_Pending").first().click();
        await page.getByRole("button", { name: "設為待審核暫存區" }).click();
        await page.getByText("已驗證並指定為待審核暫存區").waitFor({ timeout: 10000 });
        await page.getByText("10_Released").first().click();
        await page.getByRole("button", { name: "設為正式發布區" }).click();
        await page.getByText("已驗證並指定為正式發布區").waitFor({ timeout: 10000 });
        await page.getByRole("button", { name: "儲存設定" }).click();
        await page.getByText("設定已儲存").waitFor({ timeout: 10000 });
        record("Settings UI saves verified Drive folders", true);
      }

      const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      record(`Settings page avoids horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);
      record(`Settings page has no console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

function staticChecks() {
  const gdrive = read("src/lib/gdrive.ts");
  const settingsRoute = read("src/app/api/settings/route.ts");
  const foldersRoute = read("src/app/api/settings/gdrive/folders/route.ts");
  const verifyRoute = read("src/app/api/settings/gdrive/folders/verify/route.ts");
  const settingsPage = read("src/app/settings/page.tsx");
  const packageJson = read("package.json");

  record("gdrive.ts exposes folder list and verify functions", gdrive.includes("listDriveFolders") && gdrive.includes("verifyDriveFolder"));
  record("Folder list uses shared drive flags", gdrive.includes("supportsAllDrives") && gdrive.includes("includeItemsFromAllDrives"));
  record(
    "Folder list route is Admin-only",
    foldersRoute.includes('await requireRoleAsync(request, ["Admin"])') && !foldersRoute.includes("requireRole(request")
  );
  record(
    "Folder verify route is Admin-only",
    verifyRoute.includes('await requireRoleAsync(request, ["Admin"])') && !verifyRoute.includes("requireRole(request")
  );
  record("Settings route stores folder metadata snapshots", settingsRoute.includes("gdrive_pending_folder_name") && settingsRoute.includes("gdrive_released_folder_verified_at"));
  record("Settings route supports verified-save mode", settingsRoute.includes("gdrive_require_verified"));
  record("Settings UI renders folder tree and manual fallback", settingsPage.includes("gdrive-folder-tree") && settingsPage.includes("進階：手動貼 Folder ID"));
  record("Package script is registered", packageJson.includes('"qc:gdrive-folder-tree-settings"'));
}

let app;
let mockDrive;
try {
  staticChecks();
  mockDrive = await startMockDrive();
  const appPort = await getFreePort();
  const baseUrl = `http://127.0.0.1:${appPort}`;
  app = startApp(appPort, mockDrive.baseUrl);
  await waitForApp(baseUrl, app.getOutput);

  const adminCookie = await login(baseUrl, "admin@example.com");
  const engineerCookie = await login(baseUrl, "engineer@example.com");
  await verifyApi(baseUrl, adminCookie, engineerCookie, mockDrive.state);
  await verifyUi(baseUrl);
} finally {
  await stopApp(app?.child);
  if (mockDrive?.server) await new Promise((resolve) => mockDrive.server.close(resolve));
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) process.exit(1);
