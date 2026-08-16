import assert from "node:assert/strict";

import { findExactRevisionFileReuse } from "../src/lib/revision-file-idempotency.ts";

const base = {
  id: "asset-1",
  entityType: "drawing_number",
  entityId: "drawing-1",
  entityCode: "A0050-M06",
  documentCategory: "cad_3d",
  displayName: "D-0007-MA1.SLDPRT",
  description: "",
  revision: "0.5",
  fileName: "D-0007-MA1.SLDPRT",
  fileExt: "SLDPRT",
  mimeType: null,
  fileSize: 193331,
  contentHash: "ABC123",
  hashAlgorithm: "SHA-256",
  uploadedBy: "user-1",
  gdriveStatus: "none",
  syncStatus: "local_only",
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
  deletedAt: null,
  deletedBy: null,
  deleteReason: null,
  storageProvider: "j_drive",
  originalPath: "fixture",
  storageKey: "fixture",
  gdriveFileId: null,
  gdriveError: null,
  syncedAt: null
};

assert.equal(findExactRevisionFileReuse([base], {
  documentCategory: "cad_3d",
  revision: "0.5",
  fileName: "D-0007-MA1.SLDPRT",
  fileSize: 193331,
  contentHash: "abc123"
})?.id, "asset-1", "identical bytes in the same revision reuse the existing attachment");

assert.equal(findExactRevisionFileReuse([base], {
  documentCategory: "cad_3d",
  revision: "0.5",
  fileName: "D-0007-MA1.SLDPRT",
  fileSize: 193331,
  contentHash: "different"
}), null, "same filename with different bytes must not be treated as identical");

assert.equal(findExactRevisionFileReuse([base], {
  documentCategory: "cad_3d",
  revision: "0.6",
  fileName: "D-0007-MA1.SLDPRT",
  fileSize: 193331,
  contentHash: "abc123"
}), null, "same bytes in a different revision remain a distinct revision projection");

console.log("DEV-074 revision file idempotency checks passed");
