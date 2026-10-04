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
  const principalShare = readRequired("src/lib/principal-readonly-share.ts");
  const shareAccessTest = readRequired("src/app/api/public/shares/[token]/principal-share-access.test.ts");
  const readonlyShare = readRequired("src/lib/readonly-share.ts");
  const releaseRepository = readRequired("src/lib/repositories/release-repository.ts");
  const apiQc = readRequired("scripts/qc-api-test.mjs");
  const localProviderQc = readRequired("scripts/qc-file-storage-local-provider-regression.mjs");

  record("STORAGE-ROLE-ACCESS-001 package script is registered", packageJson.scripts?.["qc:file-storage-role-access"] === "node scripts/qc-file-storage-role-access.mjs");
  record("STORAGE-ROLE-ACCESS-002 Manufacturing and Procurement are released-only roles", includesAll(permissions, ['user.role === "Manufacturing"', 'user.role === "Procurement"', "isReleasedSubmissionOnlyRole"]));
  record("STORAGE-ROLE-ACCESS-003 released-only roles can read only Released submissions", permissions.includes('if (isReleasedSubmissionOnlyRole(user)) return submission.status === "Released";'));
  record("STORAGE-ROLE-ACCESS-004 Engineers remain scoped to own submissions", permissions.includes('return user.role !== "Engineer" || submission.submitted_by === user.id;'));
  record("STORAGE-ROLE-ACCESS-006 submission file lookup uses async canReadSubmission guard", includesAll(fileResponse, ["getSubmissionAsync(submissionId)", "canReadSubmissionAsync(user, submission)", 'NextResponse.json({ error: "Forbidden" }, { status: 403 })']));
  record("STORAGE-ROLE-ACCESS-007 submission file route authenticates before file lookup", ordered(submissionFileRoute, "requireAuthAsync(request)", "getStoredSubmissionFile(id, mode.fileId, auth.user)"));
  const principalFileBranch = submissionFileRoute.slice(
    submissionFileRoute.indexOf("if (token ||"), submissionFileRoute.indexOf("const auth = await requireAuthAsync(request)"));
  const legacyFileBranch = submissionFileRoute.slice(submissionFileRoute.indexOf("const auth = await requireAuthAsync(request)"));
  record("STORAGE-ROLE-ACCESS-008 submission file route audits only after authorization and file read",
    ordered(principalFileBranch, "authorizePrincipalSubmissionReadInSnapshot", "getSubmissionFile({") &&
    ordered(principalFileBranch, "readObject(authorized.pointer.key)", "await auditStorageAccess") &&
    ordered(legacyFileBranch, "getStoredSubmissionFile(id, mode.fileId, auth.user)", "await auditStorageAccess"));
  record("STORAGE-ROLE-ACCESS-009 submission file route keeps preview PDF-only guard", includesAll(submissionFileRoute, ['mode.disposition === "inline"', "Only PDF files can be previewed", "{ status: 415 }"]));

  const principalPackageBranch = releasePackageRoute.slice(
    releasePackageRoute.indexOf("if (token ||"), releasePackageRoute.indexOf("const auth = await requireAuthAsync(request)"));
  const legacyPackageBranch = releasePackageRoute.slice(releasePackageRoute.indexOf("const auth = await requireAuthAsync(request)"));
  record("STORAGE-ROLE-ACCESS-010 release package route authorizes both request modes before package read",
    ordered(principalPackageBranch, "authorizePrincipalSubmissionReadInSnapshot", "release_packages WHERE submission_id=:id") &&
    includesAll(legacyPackageBranch, ["canReadSubmissionAsync(auth.user, submission)", "return forbidden()"]));
  record("STORAGE-ROLE-ACCESS-011 release package route requires released package state", includesAll(releasePackageRoute, ['submission.status !== "Released" && submission.status !== "Obsolete"', "{ status: 409 }", "submission.release_package"]));
  record("STORAGE-ROLE-ACCESS-012 release package route audits after storage-backed read",
    ordered(principalPackageBranch, "const bytes = await readReleasePackage", "await auditStorageAccess") &&
    ordered(legacyPackageBranch, "const bytes = await readReleasePackage", "await auditStorageAccess"));

  record("STORAGE-ROLE-ACCESS-013 public share package route uses Principal permission before token selection",
    includesAll(publicSharePackageRoute, ["withPrincipalSharePermission", '"submission.view"', "getAuthorizedPublicShareInSnapshot", "deliverPrincipalReleasePackage"]));
  record("STORAGE-ROLE-ACCESS-014 public share package delivery is bound to verified Principal and company",
    includesAll(publicSharePackageRoute, ["verified.session.principalId", "verified.profile.companyId", "shareId: publicShare.share.id", "externalAccess: true"]));
  record("STORAGE-ROLE-ACCESS-015 readonly share repository normalizes revoked and expired shares", includesAll(releaseRepository, ["status: row.revoked_at ? \"revoked\" : expired ? \"expired\" : \"active\"", "Date.parse(row.expires_at)", "getReadonlyShareByTokenHash"]));
  record("STORAGE-ROLE-ACCESS-015A Principal public share lookup rejects non-active shares in the caller snapshot", includesAll(principalShare, ['share.status !== "active"', "getReadonlyShareByTokenHash", "status: 404"]));
  record("STORAGE-ROLE-ACCESS-016 qc:api preserves legacy share IDs as explicit NOT_RUN", includesAll(apiQc, ["SHARE-008 public metadata redaction", "status: \"NOT_RUN\"", "results.push({ name, passed: false"]));

  record("STORAGE-ROLE-ACCESS-017 focused Principal tests cover unauthenticated share-route denial", includesAll(shareAccessTest, ["unauthenticated denial before any public share selector lookup", "propagates missing Principal denial before supplier reply handling"]) && includesAll(apiQc, ["SHARE-010 package download behavior", "status: \"NOT_RUN\""]));
  record("STORAGE-ROLE-ACCESS-018 qc:api keeps existing share revoke ID explicitly NOT_RUN", includesAll(apiQc, ["SHARE-017 manager revokes share", "NOT_RUN"]));
  record("STORAGE-ROLE-ACCESS-019 qc:api covers procurement release API role denial and redaction", includesAll(apiQc, ["PROCAPI-001 unauthenticated procurement releases returns 401", "PROCAPI-002 Engineer procurement releases returns 403", "PROCAPI-006 response excludes local paths, token hash and audit logs"]));
  record("STORAGE-ROLE-ACCESS-020 local provider regression locks release/share storage audit", includesAll(localProviderQc, ["LOCAL-STORAGE-REGRESSION-018 release package route audits package download", "LOCAL-STORAGE-REGRESSION-033 qc:api keeps existing share IDs as failing NOT_RUN"]));

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
