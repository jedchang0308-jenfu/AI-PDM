import assert from "node:assert/strict";
import { isSafePdmApprovalReturnTo, normalizePdmApprovalReturnTo } from "../src/lib/pdm-review-navigation.ts";

assert.equal(isSafePdmApprovalReturnTo("/approvals?domain=numbering"), true);
assert.equal(isSafePdmApprovalReturnTo("//evil.example/approvals"), false);
assert.equal(isSafePdmApprovalReturnTo("/approvals\u0000"), false);
assert.equal(isSafePdmApprovalReturnTo("/numbering/drawings"), false);
assert.equal(normalizePdmApprovalReturnTo("/approvals?status=active"), "/approvals?status=active");
assert.equal(normalizePdmApprovalReturnTo("/numbering/drawings"), "/approvals");
console.log("QC DEV-067 navigation: PASS (single safe returnTo helper and approval fallback)");
