process.env.PDM_DB_PROVIDER = "postgres";
process.env.PDM_POSTGRES_URL = "postgresql://dev048_qc:dev048_qc@127.0.0.1:1/dev048_qc?connect_timeout=1";
process.env.PDM_POSTGRES_MAX_CONNECTIONS = "1";

const [databaseProvider, platform, numberStateFlow] = await Promise.all([
  import("@/lib/db-async-provider"),
  import("@/lib/platform-command"),
  import("@/lib/number-state-flow")
]);

const actor = platform.createPlatformActorContext({
  pdmUserId: "dev048-provider-outage-qc",
  organizationId: "company-jenfu",
  roles: ["Engineer", "rd"],
  scopes: ["numbering.workspace.create"],
  requestId: "dev048-provider-outage-qc"
});
const body = {
  draftMode: "new_bundle",
  root: { coreName: "Provider Outage QC Root", itemKind: "manufactured" },
  parts: [],
  drawings: [],
  relations: []
};

let result;
let caught;
try {
  result = await numberStateFlow.createNumberingDraftWorkspace({
    metadata: { actor, idempotencyKey: "dev048:provider-outage:create" },
    body
  });
} catch (error) {
  caught = error;
} finally {
  await databaseProvider.closeAsyncDatabaseClient();
}

const evidence = {
  status: caught?.status ?? null,
  code: caught?.code ?? null,
  retryable: caught?.retryable ?? null,
  resultReturned: result !== undefined,
  candidateIssued: Boolean(result?.workspace?.reservations?.length)
};
const passed = evidence.status === 503 &&
  evidence.code === "numbering_authority_unavailable" &&
  evidence.retryable === true &&
  evidence.resultReturned === false &&
  evidence.candidateIssued === false;

console.log(JSON.stringify({
  suite: "DEV-048 Phase 1A provider outage QC",
  passed: passed ? 1 : 0,
  failed: passed ? 0 : 1,
  evidence
}, null, 2));
if (!passed) process.exit(1);
