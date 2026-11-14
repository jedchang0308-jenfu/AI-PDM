import { createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import {
  parsePdmRevocationCommand, parsePdmRevocationReceipt, PdmRevocationError,
  pdmRevocationBodyLimit, readPdmRevocationJson, type PdmRevocationCommand
} from "@/lib/pdm-session-revocation-contract";

const oidc = new OAuth2Client();

export function pdmSessionRevocationConfigured() {
  return process.env.PDM_SESSION_REVOCATION_ENABLED === "1";
}

async function authenticate(request: Request) {
  const audience = process.env.PDM_SESSION_REVOCATION_AUDIENCE;
  const expectedSubject = process.env.PDM_SESSION_REVOCATION_PLATFORM_SUBJECT;
  const expectedEmail = process.env.PDM_SESSION_REVOCATION_PLATFORM_EMAIL;
  if (!audience || !expectedSubject || !/^\d+$/u.test(expectedSubject) ||
      !expectedEmail || !/^[a-z0-9._-]+@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/u.test(expectedEmail) ||
      URL.parse(audience)?.origin !== audience || !audience.startsWith("https://")) {
    throw new PdmRevocationError(503, "pdm_revocation_config_invalid");
  }
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 16_384 || !/^Bearer [\w.-]+$/u.test(authorization)) {
    throw new PdmRevocationError(401, "pdm_revocation_caller_invalid");
  }
  const payload = await oidc.verifyIdToken({ idToken: authorization.slice(7), audience })
    .then(ticket => ticket.getPayload())
    .catch(() => { throw new PdmRevocationError(401, "pdm_revocation_caller_invalid"); });
  if (!payload || !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss) ||
      payload.aud !== audience || payload.sub !== expectedSubject ||
      payload.email !== expectedEmail || payload.email_verified !== true) {
    throw new PdmRevocationError(403, "pdm_revocation_caller_denied");
  }
}

async function readReceipt(database: AsyncDatabaseClient, command: PdmRevocationCommand) {
  const row = await database.queryOne<{ receipt: unknown }>(`
    SELECT ai_pdm_core.read_principal_session_revocation_v1(
      :eventId,:operationId,:phase,:digest
    ) AS receipt
  `, command);
  return row?.receipt == null ? null : parsePdmRevocationReceipt(row.receipt, command);
}

async function verifySource(database: AsyncDatabaseClient, command: PdmRevocationCommand) {
  if (command.phase === "global_logout") {
    const current = await new JenfuAuthEpochRepository(database).readCanonicalPrincipalState(command.principalIds[0]);
    if (current.authEpoch < command.sourceEpoch || !current.revokedBefore ||
        Date.parse(current.revokedBefore) < Date.parse(command.revokedBefore)) {
      throw new PdmRevocationError(409, "pdm_revocation_source_not_readable");
    }
    return;
  }
  // Only the authenticated relay may report the owner's terminal cancellation.
  // The database still requires the exact pending operation and scope.
  if (command.phase !== "published") return;

  const row = await database.queryOne<{ publication_version: string }>(`
    SELECT publication_version
    FROM orgmaster_contract.read_ai_pdm_session_publication_v1(:operationId,:publicationVersion)
  `, command);
  if (row?.publication_version !== command.publicationVersion) {
    throw new PdmRevocationError(409, "pdm_revocation_source_not_readable");
  }
}

export async function applyPdmSessionRevocation(database: AsyncDatabaseClient,
  command: PdmRevocationCommand, readback: boolean) {
  if (database.kind !== "postgres") throw new PdmRevocationError(503, "pdm_revocation_unavailable");
  return database.transaction(async snapshot => {
    await snapshot.execute("SET LOCAL statement_timeout = '10s'");
    await snapshot.execute("SET LOCAL lock_timeout = '5s'");
    const prior = await readReceipt(snapshot, command);
    if (prior || readback) return prior;
    // DEV-057's publication sequence is a monotonic PostgreSQL bigint.
    if (command.sourceApp === "orgmaster" && ![command.baselineVersion, command.publicationVersion]
      .every(version => /^(?:0|[1-9]\d{0,18})$/u.test(version) && BigInt(version) <= 9223372036854775807n)) {
      throw new PdmRevocationError(400, "pdm_revocation_source_version_invalid");
    }
    await verifySource(snapshot, command);
    const operationHash = createHash("sha256").update(JSON.stringify([
      command.sourceApp, command.baselineVersion, command.publicationVersion, command.principalIds
    ])).digest("hex");
    const row = await snapshot.queryOne<{ receipt: unknown }>(`
      SELECT ai_pdm_core.apply_principal_session_revocation_v1(
        :eventId,:operationId,:phase,:digest,:operationHash,:principalIds,:sourceEpoch,:revokedBefore,
        :baselineVersion,:publicationVersion
      ) AS receipt
    `, { ...command, operationHash });
    return parsePdmRevocationReceipt(row?.receipt, command);
  }, { isolationLevel: "read_committed", readOnly: readback });
}

export async function handlePdmSessionRevocation(request: Request, readback: boolean) {
  const headers = { "cache-control": "no-store" };
  if (!pdmSessionRevocationConfigured()) {
    return Response.json({ code: "pdm_revocation_disabled" }, { status: 503, headers });
  }
  try {
    await authenticate(request);
    const command = parsePdmRevocationCommand(await readPdmRevocationJson(request, pdmRevocationBodyLimit));
    const receipt = await applyPdmSessionRevocation(getAsyncDatabaseClient(), command, readback);
    if (!receipt) return Response.json({ code: "pdm_revocation_event_not_found" }, { status: 404, headers });
    return Response.json(receipt, { headers });
  } catch (error) {
    if (error instanceof PdmRevocationError) {
      return Response.json({ code: error.code }, { status: error.status, headers });
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return Response.json({ code: "pdm_revocation_conflict" }, { status: 409, headers });
    }
    return Response.json({ code: "pdm_revocation_unavailable" }, { status: 503, headers });
  }
}
