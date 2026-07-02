#!/usr/bin/env node

import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const results = [];
const root = process.cwd();

const readRequired = (filePath) => readProjectFile(root, filePath);

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function ordered(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

try {
  const packageJson = readProjectJson(root, "package.json");
  const permissions = readRequired("src/lib/permissions.ts");
  const fileResponse = readRequired("src/lib/file-response.ts");
  const submissionFileRoute = readRequired("src/app/api/submissions/[id]/files/[...filePath]/route.ts");
  const releasePackageRoute = readRequired("src/app/api/submissions/[id]/release-package/route.ts");
  const publicSharePackageRoute = readRequired("src/app/api/public/shares/[token]/package/route.ts");
  const readonlyShare = readRequired("src/lib/readonly-share.ts");
  const releaseRepository = readRequired("src/lib/repositories/release-repository.ts");
  const apiQc = readRequired("scripts/qc-api-test.mjs");
  const localProviderQc = readRequired("scripts/qc-file-storage-local-provider-regression.mjs");

  record("STORAGE-ROLE-ACCESS-001 package script is registered", packageJson.scripts?.["qc:file-storage-role-access"] === "node scripts/qc-file-storage-role-access.mjs");
  record("STORAGE-ROLE-ACCESS-002 Manufacturing and Procurement are released-only roles", includesAll(permissions, ['user.role === "Manufacturing"', 'user.role === "Procurement"', "isBomReleasedOnlyRole"]));
  record("STORAGE-ROLE-ACCESS-003 released-only roles can read only Released submissions", permissions.includes('if (isBomReleasedOnlyRole(user)) return submission.status === "Released";'));
  record("STORAGE-ROLE-ACCESS-004 Engineers remain scoped to own submissions", permissions.includes('return user.role !== "Engineer" || submission.submitted_by === user.id;'));
  record("STORAGE-ROLE-ACCESS-005 BOM draft remains blocked for released-only roles", permissions.includes("return !isBomReleasedOnlyRole(user) && canReadSubmission(user, submission);"));

  record("STORAGE-ROLE-ACCESS-006 submission file lookup uses async canReadSubmission guard", includesAll(fileResponse, ["getSubmissionAsync(submissionId)", "canReadSubmissionAsync(user, submission)", 'NextResponse.json({ error: "Forbidden" }, { status: 403 })']));
  record("STORAGE-ROLE-ACCESS-007 submission file route authenticates before file lookup", ordered(submissionFileRoute, "requireAuthAsync(request)", "getStoredSubmissionFile(id, mode.fileId, auth.user)"));
  record("STORAGE-ROLE-ACCESS-008 submission file route audits only after authorization and file read", ordered(submissionFileRoute, "getStoredSubmissionFile(id, mode.fileId, auth.user)", "await auditStorageAccess"));
  record("STORAGE-ROLE-ACCESS-009 submission file route keeps preview PDF-only guard", includesAll(submissionFileRoute, ['mode.disposition === "inline"', "Only PDF files can be previewed", "{ status: 415 }"]));

  record("STORAGE-ROLE-ACCESS-010 release package route uses async canReadSubmission guard", includesAll(releasePackageRoute, ["canReadSubmissionAsync(auth.user, submission)", "return forbidden()"]));
  record("STORAGE-ROLE-ACCESS-011 release package route requires released package state", includesAll(releasePackageRoute, ['submission.status !== "Released" && submission.status !== "Obsolete"', "{ status: 409 }", "submission.release_package"]));
  record("STORAGE-ROLE-ACCESS-012 release package route audits after storage-backed read", ordered(releasePackageRoute, "const bytes = await readReleasePackage", "await auditStorageAccess"));

  record("STORAGE-ROLE-ACCESS-013 public share package route is token scoped", includesAll(publicSharePackageRoute, ["getPublicShareAsync(token)", "publicShare.share.id", "recordPublicShareAccessAsync"]));
  record("STORAGE-ROLE-ACCESS-014 public share package route never accepts actor cookies for scope", !publicSharePackageRoute.includes("requireAuth") && publicSharePackageRoute.includes("actorId: null"));
  record("STORAGE-ROLE-ACCESS-015 readonly share repository normalizes revoked and expired shares", includesAll(releaseRepository, ["status: row.revoked_at ? \"revoked\" : expired ? \"expired\" : \"active\"", "Date.parse(row.expires_at)", "getReadonlyShareByTokenHash"]));
  record("STORAGE-ROLE-ACCESS-015A public share lookup rejects non-active shares", includesAll(readonlyShare, ['share.status !== "active"', "getReadonlyShareByTokenHash", "return null"]));
  record("STORAGE-ROLE-ACCESS-016 readonly share metadata redacts local paths and token hashes", includesAll(apiQc, ["SHARE-008 public share response excludes local paths, token hash and audit logs", "!publicShareText.includes(\"local_path\")", "!publicShareText.includes(\"token_hash\")"]));

  record("STORAGE-ROLE-ACCESS-017 qc:api covers unauthenticated and released package download", includesAll(apiQc, ["PKG-003 unauthenticated package download returns 401", "PKG-004 package download returns 200"]));
  record("STORAGE-ROLE-ACCESS-018 qc:api covers share package and revocation", includesAll(apiQc, ["SHARE-010 public package download returns ZIP", "SHARE-017 manager revokes share", "SHARE-019 revoked public package download returns 404"]));
  record("STORAGE-ROLE-ACCESS-019 qc:api covers procurement release API role denial and redaction", includesAll(apiQc, ["PROCAPI-001 unauthenticated procurement releases returns 401", "PROCAPI-002 Engineer procurement releases returns 403", "PROCAPI-006 response excludes local paths, token hash and audit logs"]));
  record("STORAGE-ROLE-ACCESS-020 local provider regression locks release/share storage audit", includesAll(localProviderQc, ["LOCAL-STORAGE-REGRESSION-018 release package route audits package download", "LOCAL-STORAGE-REGRESSION-033 qc:api asserts supplier share package boundary"]));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
