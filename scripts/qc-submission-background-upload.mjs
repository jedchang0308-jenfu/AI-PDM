#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const helperPath = path.join(root, "src", "lib", "submission-background-upload.ts");
const routePaths = [
  path.join(root, "src", "app", "api", "submissions", "route.ts"),
  path.join(root, "src", "app", "api", "numbering", "drawing-revisions", "submissions", "route.ts"),
  path.join(root, "src", "app", "api", "numbering", "drawings", "[drawingNumber]", "submissions", "route.ts")
];

const helperSource = fs.readFileSync(helperPath, "utf8");
const routeSources = routePaths.map((routePath) => fs.readFileSync(routePath, "utf8"));
const { triggerBackgroundUpload } = await import("@/lib/submission-background-upload");

assert.equal(typeof triggerBackgroundUpload, "function");
assert.match(helperSource, /export async function triggerBackgroundUpload/);
assert.equal((helperSource.match(/async function triggerBackgroundUpload/g) ?? []).length, 1);
for (const routeSource of routeSources) {
  assert.match(routeSource, /import \{ triggerBackgroundUpload \} from "@\/lib\/submission-background-upload"/);
  assert.doesNotMatch(routeSource, /async function triggerBackgroundUpload/);
  assert.doesNotMatch(routeSource, /uploadFileToDrive/);
}

const file = (id) => ({ id, local_path: `data/${id}.pdf`, original_filename: `${id}.pdf` });
const successEvents = [];
await triggerBackgroundUpload("submission-success", "folder-success", {
  getFilesNeedingUpload: async (submissionId) => {
    successEvents.push(["get", submissionId]);
    return [file("file-a"), file("file-b")];
  },
  updateFileGDriveStatus: async (fileId, status, gdriveFileId) => {
    successEvents.push(["status", fileId, status, gdriveFileId]);
  },
  uploadFile: async (input) => {
    successEvents.push(["upload", input]);
    return `drive-${input.filename.replace(".pdf", "")}`;
  }
});
assert.deepEqual(successEvents, [
  ["get", "submission-success"],
  ["status", "file-a", "uploading", undefined],
  ["upload", { localPath: "data/file-a.pdf", filename: "file-a.pdf", targetFolderId: "folder-success" }],
  ["status", "file-a", "uploaded", "drive-file-a"],
  ["status", "file-b", "uploading", undefined],
  ["upload", { localPath: "data/file-b.pdf", filename: "file-b.pdf", targetFolderId: "folder-success" }],
  ["status", "file-b", "uploaded", "drive-file-b"]
]);

const failureEvents = [];
const loggedErrors = [];
const originalConsoleError = console.error;
console.error = (...args) => loggedErrors.push(args);
try {
  await triggerBackgroundUpload("submission-failure", "folder-failure", {
    getFilesNeedingUpload: async () => [file("file-fail"), file("file-after")],
    updateFileGDriveStatus: async (fileId, status, gdriveFileId) => {
      failureEvents.push(["status", fileId, status, gdriveFileId]);
    },
    uploadFile: async (input) => {
      failureEvents.push(["upload", input]);
      if (input.filename === "file-fail.pdf") throw new Error("upload failed");
      return "drive-file-after";
    }
  });
} finally {
  console.error = originalConsoleError;
}
assert.deepEqual(failureEvents, [
  ["status", "file-fail", "uploading", undefined],
  ["upload", { localPath: "data/file-fail.pdf", filename: "file-fail.pdf", targetFolderId: "folder-failure" }],
  ["status", "file-fail", "failed", undefined],
  ["status", "file-after", "uploading", undefined],
  ["upload", { localPath: "data/file-after.pdf", filename: "file-after.pdf", targetFolderId: "folder-failure" }],
  ["status", "file-after", "uploaded", "drive-file-after"]
]);
assert.equal(loggedErrors.length, 1);
assert.equal(loggedErrors[0][0], "Failed to upload file file-fail to Drive:");

await assert.rejects(
  triggerBackgroundUpload("submission-fetch-failure", "folder-failure", {
    getFilesNeedingUpload: async () => {
      throw new Error("file lookup failed");
    },
    updateFileGDriveStatus: async () => undefined,
    uploadFile: async () => "unused"
  }),
  /file lookup failed/
);

console.log("QC submission background upload: PASS (route ownership + success/failure/error characterization)");
