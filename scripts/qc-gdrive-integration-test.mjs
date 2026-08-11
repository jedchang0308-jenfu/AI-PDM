#!/usr/bin/env node

import { createServer } from "node:http";

const pendingFolderId = "mock-pending-folder";
const releasedFolderId = "mock-released-folder";
const mockToken = "mock-drive-token";
const filename = "QC-GDRIVE-adapter.pdf";
const fileBytes = "mock gdrive adapter bytes";

function startMockDrive() {
  const state = {
    requests: [],
    fileId: "mock-drive-file-1",
    parents: [pendingFolderId],
    appProperties: null
  };

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      state.requests.push({
        method: req.method,
        path: url.pathname,
        search: url.search,
        authorization: req.headers.authorization ?? "",
        contentType: req.headers["content-type"] ?? "",
        bodyText
      });

      if (req.method === "POST" && url.pathname === "/upload/drive/v3/files") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: state.fileId }));
        return;
      }

      if (req.method === "GET" && url.pathname === `/drive/v3/files/${state.fileId}`) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ parents: state.parents }));
        return;
      }

      if (req.method === "PATCH" && url.pathname === `/drive/v3/files/${state.fileId}`) {
        const addParents = url.searchParams.get("addParents");
        const removeParents = url.searchParams.get("removeParents");
        if (addParents || removeParents) {
          state.parents = state.parents.filter((parent) => !removeParents?.split(",").includes(parent));
          for (const parent of addParents?.split(",") ?? []) {
            if (parent && !state.parents.includes(parent)) state.parents.push(parent);
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ id: state.fileId, parents: state.parents }));
          return;
        }

        const parsed = bodyText ? JSON.parse(bodyText) : {};
        state.appProperties = parsed.appProperties ?? null;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: state.fileId, appProperties: state.appProperties }));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Unhandled mock Drive route: ${req.method} ${url.pathname}${url.search}` }));
    });
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

function expect(name, actual, expected) {
  return { name, passed: actual === expected, actual, expected };
}

function hasRequest(state, predicate) {
  return state.requests.some(predicate);
}

let mock;
const results = [];

try {
  mock = await startMockDrive();
  process.env.GOOGLE_DRIVE_API_BASE_URL = `${mock.baseUrl}/drive/v3`;
  process.env.GOOGLE_DRIVE_UPLOAD_BASE_URL = `${mock.baseUrl}/upload/drive/v3`;
  process.env.GOOGLE_DRIVE_MOCK_ACCESS_TOKEN = mockToken;

  const { moveFileToFolder, setFileAppProperties, uploadBytesToDrive } = await import("../src/lib/gdrive.ts");
  const fileId = await uploadBytesToDrive({
    bytes: Buffer.from(fileBytes),
    filename,
    targetFolderId: pendingFolderId,
    mimeType: "application/pdf"
  });
  const moveResult = await moveFileToFolder(fileId, releasedFolderId);
  await setFileAppProperties(fileId, {
    Status: "Official",
    SubmissionId: "QC-GDRIVE-adapter",
    DrawingNumber: "QC-GDRIVE",
    Revision: "1"
  });

  const uploadRequest = mock.state.requests.find((request) => request.method === "POST" && request.path === "/upload/drive/v3/files");
  results.push(expect("GDRIVE-001 adapter upload returns Drive file id", fileId, mock.state.fileId));
  results.push(expect("GDRIVE-002 multipart upload endpoint was called", Boolean(uploadRequest), true));
  results.push(expect("GDRIVE-003 multipart upload targets Shared Drive semantics", uploadRequest?.search.includes("supportsAllDrives=true"), true));
  results.push(expect("GDRIVE-004 upload metadata contains filename and pending folder", Boolean(uploadRequest?.bodyText.includes(filename) && uploadRequest.bodyText.includes(pendingFolderId)), true));
  results.push(expect("GDRIVE-005 upload includes exact file bytes", uploadRequest?.bodyText.includes(fileBytes), true));
  results.push(expect("GDRIVE-006 move reports prior parent", moveResult.previousParents.join(","), pendingFolderId));
  results.push(expect("GDRIVE-007 move changes parent to released folder", mock.state.parents.join(","), releasedFolderId));
  results.push(expect("GDRIVE-008 move endpoint was called", hasRequest(mock.state, (request) => request.method === "PATCH" && request.search.includes(`addParents=${releasedFolderId}`)), true));
  results.push(expect("GDRIVE-009 anti-forgery metadata was written", mock.state.appProperties?.Status, "Official"));
  results.push(expect("GDRIVE-010 metadata carries the adapter submission id", mock.state.appProperties?.SubmissionId, "QC-GDRIVE-adapter"));
  results.push(expect("GDRIVE-011 every Drive call uses the configured bearer token", mock.state.requests.every((request) => request.authorization === `Bearer ${mockToken}`), true));

  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  process.exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ passed: 0, failed: 1, results, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  if (mock) await new Promise((resolve) => mock.server.close(resolve));
}
