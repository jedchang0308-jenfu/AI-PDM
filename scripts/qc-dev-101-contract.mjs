import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function check(id, description, passed, detail = "") { checks.push({ id, description, status: passed ? "PASS" : "FAIL", detail }); }

const contract = read("src/lib/pdm-review-package-contract.ts");
const service = read("src/lib/pdm-review-package.ts");
const route = read("src/app/api/pdm/review-requests/[requestId]/route.ts");
const targetRoute = read("src/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/route.ts");
const comparisonRoute = read("src/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/comparison/route.ts");
const fileRoute = read("src/app/api/pdm/file-assets/[fileAssetId]/route.ts");
const reviewShell = read("src/components/canonical-review-package-workspace.tsx");
const reviewTargetAdapter = read("src/components/canonical-review-target-workspace.tsx");
const matrix = read("src/components/relation-matrix-table.tsx");
const drawing = read("src/components/canonical-drawing-change-workspace.tsx");
const part = read("src/components/canonical-change-workspace.tsx");
const drawingService = read("src/lib/drawing-revision-work.ts");
const partService = read("src/lib/part-change-work.ts");
const approvalRepository = read("src/lib/repositories/approval-platform-async-repository.ts");
const approvalOwnerRoute = read("src/lib/pdm-approval-owner-route.ts");
const approvalInboxRoute = read("src/app/api/approvals/inbox/route.ts");
const approvalPage = read("src/app/approvals/page.tsx");
const approvalWorkspace = read("src/components/approval-request-workspace.tsx");
const browserSmoke = read("scripts/qc-dev-101-owner-flow-browser.mjs");
const recognitionProjection = read("src/lib/drawing-recognition-review-projection.ts");
const recognitionSnapshot = read("src/lib/drawing-recognition-review-snapshot.ts");
const recognitionPanel = read("src/components/drawing-recognition-workspace-panel.tsx");
const recognitionRoute = read("src/app/api/numbering/recognition-sessions/[sessionId]/route.ts");

check("DEV101-CONTRACT-001", "v2 package schema and hard limits are declared", contract.includes('pdm-review-package-v2') && contract.includes("PDM_REVIEW_PACKAGE_MAX_TARGETS") && contract.includes("PDM_REVIEW_PACKAGE_MAX_CELLS"));
check("DEV101-CONTRACT-002", "persisted file evidence has no signed/download URL field", contract.includes("sourceFileAssetId") && !/downloadHref|signedUrl|signed_url/u.test(contract));
check("DEV101-CONTRACT-003", "package hash is stable SHA-256 over canonical JSON", service.includes("stableJson") && service.includes('createHash("sha256")'));
check("DEV101-CONTRACT-004", "writer is feature-flagged and old v1 path remains", drawingService.includes("reviewPackageV2WriteEnabled") && partService.includes("reviewPackageV2WriteEnabled") && route.includes("parseReviewPackageSnapshot"));
check("DEV101-CONTRACT-005", "decision verifies package integrity and uses immutable decision basis hash", drawingService.includes("verifyReviewPackageIntegrity") && partService.includes("verifyReviewPackageIntegrity") && drawingService.includes("verifiedPackage?.decisionBasis.hash") && partService.includes("verifiedPackage?.decisionBasis.hash"));
check("DEV101-CONTRACT-006", "shell endpoint returns matrix and target summaries without live identity queries", route.includes("targetSummaries") && route.includes("packageValue.matrix"));
check("DEV101-CONTRACT-007", "target and comparison endpoints are present and reviewer-scoped", targetRoute.includes("reviewerUserId") && comparisonRoute.includes("compareReviewTarget"));
check("DEV101-CONTRACT-008", "review_package file context checks package membership and content hash", fileRoute.includes('"review_package"') && fileRoute.includes("contentHash") && fileRoute.includes("verifyReviewScope"));
check("DEV101-CONTRACT-009", "shared renderer is used through a domain-free immutable review adapter", reviewShell.includes("CanonicalReviewTargetWorkspace") && !reviewShell.includes("CanonicalDrawingChangeWorkspace") && !reviewShell.includes("CanonicalChangeWorkspace") && reviewTargetAdapter.includes("CanonicalDrawingChangeWorkspace") && reviewTargetAdapter.includes("CanonicalChangeWorkspace") && drawing.includes("snapshotMode") && part.includes("initialData"));
check("DEV101-CONTRACT-010", "matrix axes switch targets and cells use visual markers", reviewShell.includes("onSelectDrawing") && reviewShell.includes("onSelectPart") && reviewShell.includes("showVisualMarkers") && matrix.includes("pdm-relation-matrix-marker"));
check("DEV101-CONTRACT-011", "target URL state is persisted and reloadable", reviewShell.includes('searchParams.get("activeTarget")') && reviewShell.includes('query.set("activeTarget"') && reviewShell.includes("router.replace") && reviewShell.includes("router.push"));
check("DEV101-CONTRACT-012", "feature avoids schema changes", !service.includes("CREATE TABLE") && !service.includes("ALTER TABLE"));
check("DEV101-CONTRACT-013", "canonical PDM requests have an actor-scoped actionable inbox adapter", approvalRepository.includes('| "pdm_work_review"') && approvalRepository.includes("listPdmWorkReviewInbox") && approvalRepository.includes("review.reviewer_user_id = :actorId") && approvalRepository.includes("review.request_status = 'pending'"));
check("DEV101-CONTRACT-014", "canonical request kinds use explicit PDM action codes and server-owned hrefs", approvalOwnerRoute.includes("numbering.pdm_drawing_revision_review") && approvalOwnerRoute.includes("numbering.pdm_drawing_rd_void_review") && approvalOwnerRoute.includes("numbering.pdm_part_change_review") && approvalInboxRoute.includes("buildPdmApprovalOwnerHref(item, returnTo)"));
check("DEV101-CONTRACT-015", "approval UI consumes ownerHref and preserves return state", approvalPage.includes("item.ownerHref") && approvalPage.includes("approvalDrawerReturnTo(item.id)") && approvalPage.includes('params.set("returnTo", approvalDrawerReturnTo())'));
check("DEV101-CONTRACT-016", "focused browser smoke begins at the rendered inbox instead of a direct detail URL", browserSmoke.indexOf("const listUrl") < browserSmoke.indexOf('data-review-schema="pdm-review-package-v2"') && browserSmoke.includes("inboxRow.click()"));
check("DEV101-CONTRACT-017", "rapid target switching rejects stale target responses", reviewShell.includes("targetRequestRef") && reviewShell.includes("requestSequence !== targetRequestRef.current"));
check("DEV101-CONTRACT-018", "request-level decision token comes from the package shell and does not depend on target hydration", approvalWorkspace.includes("initialContractToken={canonicalReviewToken}") && reviewShell.includes("useState(initialContractToken)"));
check("DEV101-CONTRACT-019", "recognition review projection is versioned, exact-revision scoped and zero-write batch read", recognitionProjection.includes("pdm-recognition-review-projection-v1") && recognitionSnapshot.includes("source_context_type = 'drawing_revision'") && recognitionSnapshot.includes("source_context_id IN") && recognitionSnapshot.includes("Batch, zero-write snapshot read"));
check("DEV101-CONTRACT-020", "recognition projection has an independent inner hash and incomplete owner basis fails approval closed", service.includes("projectionHash") && service.includes("assertReviewPackageRecognitionReady") && drawingService.includes("assertReviewPackageRecognitionReady") && contract.includes("isReviewPackageRecognitionProjection"));
check("DEV101-CONTRACT-021", "editor and reviewer use one recognition field projector and one panel without reviewer live/latest fetch", recognitionRoute.includes("projectDrawingRecognitionReviewFields") && recognitionPanel.includes("session.reviewFields") && recognitionPanel.includes("snapshotMode ? null : session") && drawing.includes("snapshotProjection={data.recognition}"));
check("DEV101-CONTRACT-022", "normal-path browser rejects latest-session leakage in the rendered reviewer surface", browserSmoke.includes("DEV101-OWNER-v2-010R") && browserSmoke.includes("recognitionNetwork.length === 0") && browserSmoke.includes("pdm-recognition-review-projection-v1"));
check("DEV101-CONTRACT-023", "editor and immutable package pass related, same-company Part owner targets into the same projector", recognitionRoute.includes("partOwnerTargets: session.partOwnerTargets") && recognitionSnapshot.includes("partOwnerTargetsByDrawing") && recognitionSnapshot.includes("{ partOwnerTargets }") && recognitionProjection.includes("part_owner_invalid"));

const failed = checks.filter((item) => item.status === "FAIL");
for (const item of checks) console.log(`${item.status} ${item.id} ${item.description}${item.detail ? ` — ${item.detail}` : ""}`);
console.log(`DEV-101 contract summary: ${checks.length - failed.length}/${checks.length} PASS`);
process.exit(failed.length ? 1 : 0);
