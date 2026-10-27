import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";
import { validatePrincipalPublishedGrantSnapshot } from "@/lib/jenfu-principal-published-grant-validation";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";

export const WINDOWS_SERVICE_PROTOCOL_VERSION = 1;
export const WINDOWS_SERVICE_PURPOSES = [
  "preview_jobs", "preview_heartbeat", "recognition_jobs", "recognition_heartbeat",
  "settings_secret_probe", "solidworks_credential"
] as const;
export const WINDOWS_SERVICE_CAPABILITIES = [
  "solidworks_3d_preview_png", "solidworks_2d_preview_png", "solidworks_document_manager"
] as const;

export type WindowsServiceDeviceStatus = "active" | "revoked";
export type WindowsServiceDevice = {
  id: string;
  companyId: string;
  name: string;
  status: WindowsServiceDeviceStatus;
  instanceId: string | null;
  serviceVersion: string;
  protocolVersion: 1;
  ownerPrincipalId: string;
  registeredBy: string;
  registeredAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  rowVersion: number;
};
export type WindowsServiceDeviceListItem = WindowsServiceDevice & {
  connection: "online" | "offline" | "revoked";
  capabilities: Array<{ code: string; status: "ready" | "blocked" | "degraded"; readerVersion: string | null }>;
};
export type WindowsServiceActiveJob = {
  kind: "preview" | "recognition" | "probe";
  id: string;
  leaseBasis: Record<string, string | number>;
};
export type WindowsServiceEnrollment = {
  id: string;
  companyId: string;
  requestId: string;
  requestHash: string;
  codeHash: string;
  createdBy: string;
  creatorSessionHash: string;
  creatorAuthEpoch: number;
  creatorIdentityIssuer: string;
  creatorIdentitySubject: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  deviceId: string | null;
};

type DeviceRow = {
  id: string; company_id: string; name: string; credential_hash: string; status: WindowsServiceDeviceStatus;
  instance_id: string | null; service_version: string; protocol_version: number | string;
  owner_principal_id: string; registered_by: string; registered_at: string | Date; last_seen_at: string | Date | null;
  revoked_at: string | Date | null; revoked_by: string | null; row_version: number | string;
};
type EnrollmentRow = {
  id: string; company_id: string; request_id: string; request_hash: string; code_hash: string;
  created_by: string; creator_session_hash: string; creator_auth_epoch: number | string;
  creator_identity_issuer: string; creator_identity_subject: string;
  created_at: string | Date; expires_at: string | Date; consumed_at: string | Date | null; device_id: string | null;
};

export class WindowsServiceDeviceError extends Error {
  constructor(readonly code: string, readonly status: number, message = code) { super(message); }
}

function iso(value: string | Date | null) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function mapDevice(row: DeviceRow): WindowsServiceDevice {
  return {
    id: row.id, companyId: row.company_id, name: row.name, status: row.status,
    instanceId: row.instance_id, serviceVersion: row.service_version,
    protocolVersion: Number(row.protocol_version) as 1, ownerPrincipalId: row.owner_principal_id,
    registeredBy: row.registered_by,
    registeredAt: iso(row.registered_at)!, lastSeenAt: iso(row.last_seen_at),
    revokedAt: iso(row.revoked_at), revokedBy: row.revoked_by, rowVersion: Number(row.row_version)
  };
}
function mapEnrollment(row: EnrollmentRow): WindowsServiceEnrollment {
  return {
    id: row.id, companyId: row.company_id, requestId: row.request_id, requestHash: row.request_hash,
    codeHash: row.code_hash, createdBy: row.created_by, creatorSessionHash: row.creator_session_hash,
    creatorAuthEpoch: Number(row.creator_auth_epoch), creatorIdentityIssuer: row.creator_identity_issuer,
    creatorIdentitySubject: row.creator_identity_subject, createdAt: iso(row.created_at)!,
    expiresAt: iso(row.expires_at)!, consumedAt: iso(row.consumed_at), deviceId: row.device_id
  };
}
function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}
function validHash(value: string) { return /^[a-f0-9]{64}$/u.test(value); }
function validVersion(value: string) { return value.length >= 1 && value.length <= 40 && value.trim() === value; }
function validName(value: string) { return value.length >= 1 && value.length <= 100 && value.trim() === value; }
function nowMs(value: string | Date) { return new Date(value).getTime(); }
function timingSafeHashEqual(left: string, right: string) {
  return validHash(left) && validHash(right) &&
    crypto.timingSafeEqual(Buffer.from(left, "ascii"), Buffer.from(right, "ascii"));
}

async function databaseNow(client: AsyncDatabaseClient) {
  const row = await client.queryOne<{ current_time: string | Date }>("SELECT CURRENT_TIMESTAMP AS current_time");
  if (!row || !Number.isFinite(nowMs(row.current_time))) throw new WindowsServiceDeviceError("WINDOWS_SERVICE_DATABASE_TIME_UNAVAILABLE", 503);
  return new Date(row.current_time).toISOString();
}

const RATE_LIMIT_UPSERT = `
  INSERT INTO employee_login_rate_limits
    (company_id,identifier_hash,window_started_at,attempt_count,blocked_until,updated_at)
  VALUES (:companyId,:identifierHash,:now,1,NULL,:now)
  ON CONFLICT(company_id,identifier_hash) DO UPDATE SET
    window_started_at=CASE WHEN employee_login_rate_limits.window_started_at<=:windowCutoff
      THEN excluded.window_started_at ELSE employee_login_rate_limits.window_started_at END,
    attempt_count=CASE WHEN employee_login_rate_limits.window_started_at<=:windowCutoff
      THEN 1 ELSE employee_login_rate_limits.attempt_count+1 END,
    blocked_until=CASE
      WHEN employee_login_rate_limits.blocked_until>:now THEN employee_login_rate_limits.blocked_until
      WHEN employee_login_rate_limits.window_started_at<=:windowCutoff THEN NULL
      WHEN employee_login_rate_limits.attempt_count+1>:maxAttempts THEN :blockedUntil ELSE NULL END,
    updated_at=excluded.updated_at
`;

export class WindowsServiceDeviceRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async list(companyId: string, ownerPrincipalId?: string): Promise<WindowsServiceDeviceListItem[]> {
    const currentTime = await databaseNow(this.client);
    const rows = await this.client.query<DeviceRow>(`
      SELECT * FROM ai_pdm_core.windows_service_devices
      WHERE company_id=:companyId
        AND (CAST(:ownerPrincipalId AS text) IS NULL OR owner_principal_id=CAST(:ownerPrincipalId AS text))
      ORDER BY registered_at DESC,id
    `, { companyId, ownerPrincipalId: ownerPrincipalId ?? null });
    const heartbeats = await this.client.query<{
      worker_id: string; capability_code: string; status: "ready" | "blocked" | "degraded";
      reader_version: string | null; last_seen_at: string | Date;
    }>(`
      SELECT heartbeat.worker_id,heartbeat.capability_code,heartbeat.status,
        heartbeat.reader_version,heartbeat.last_seen_at
      FROM ai_pdm_core.worker_capability_heartbeats heartbeat
      JOIN ai_pdm_core.windows_service_devices device
        ON heartbeat.worker_id=(device.id || ':' || device.instance_id)
      WHERE device.company_id=:companyId AND device.status='active' AND device.instance_id IS NOT NULL
        AND (CAST(:ownerPrincipalId AS text) IS NULL OR device.owner_principal_id=CAST(:ownerPrincipalId AS text))
    `, { companyId, ownerPrincipalId: ownerPrincipalId ?? null });
    const cutoff = Date.parse(currentTime) - 30_000;
    return rows.map((row) => {
      const device = mapDevice(row);
      const prefix = device.instanceId ? `${device.id}:${device.instanceId}` : "";
      const capabilities = heartbeats.filter((item) => item.worker_id === prefix &&
        Number.isFinite(nowMs(item.last_seen_at)) && nowMs(item.last_seen_at) >= cutoff)
        .map((item) => ({ code: item.capability_code, status: item.status, readerVersion: item.reader_version }));
      const online = device.lastSeenAt != null && Date.parse(device.lastSeenAt) >= cutoff;
      return { ...device, connection: device.status === "revoked" ? "revoked" : online ? "online" : "offline", capabilities };
    });
  }

  async createEnrollment(input: {
    companyId: string; requestId: string; requestHash: string; codeHash: string;
    createdBy: string; creatorSessionHash: string; creatorAuthEpoch: number;
    creatorIdentityIssuer: string; creatorIdentitySubject: string;
  }) {
    if (!validUuid(input.requestId) || !validHash(input.requestHash) || !validHash(input.codeHash) ||
      !validHash(input.creatorSessionHash) || !Number.isSafeInteger(input.creatorAuthEpoch) ||
      input.creatorAuthEpoch < 0 || !input.creatorIdentityIssuer || input.creatorIdentityIssuer.length > 255 ||
      !input.creatorIdentitySubject || input.creatorIdentitySubject.length > 255) {
      throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLLMENT_INPUT_INVALID", 400);
    }
    return this.client.transaction(async (client) => {
      const existing = await client.queryOne<EnrollmentRow>(`
        SELECT * FROM ai_pdm_core.windows_service_enrollments
        WHERE company_id=:companyId AND request_id=:requestId
      `, input);
      if (existing) {
        if (!timingSafeHashEqual(existing.request_hash, input.requestHash) ||
          !timingSafeHashEqual(existing.code_hash, input.codeHash) || existing.created_by !== input.createdBy) {
          throw new WindowsServiceDeviceError("WINDOWS_SERVICE_REQUEST_ID_REUSE", 409);
        }
        return { enrollment: mapEnrollment(existing), created: false };
      }
      const createdAt = await databaseNow(client);
      const expiresAt = new Date(Date.parse(createdAt) + 10 * 60_000).toISOString();
      const id = crypto.randomUUID();
      await client.execute(`
        INSERT INTO ai_pdm_core.windows_service_enrollments
          (id,company_id,request_id,request_hash,code_hash,created_by,creator_session_hash,
           creator_auth_epoch,creator_identity_issuer,creator_identity_subject,created_at,expires_at)
        VALUES (:id,:companyId,:requestId,:requestHash,:codeHash,:createdBy,:creatorSessionHash,
          :creatorAuthEpoch,:creatorIdentityIssuer,:creatorIdentitySubject,:createdAt,:expiresAt)
      `, { ...input, id, createdAt, expiresAt });
      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.createdBy, action: "settings.windows_service.enrollment.create",
        companyId: input.companyId, scopeKind: "tenant", detail: { enrollmentId: id, requestId: input.requestId, expiresAt }
      });
      return { enrollment: { ...input, id, createdAt, expiresAt, consumedAt: null, deviceId: null }, created: true };
    });
  }

  async revoke(input: { companyId: string; deviceId: string; expectedRowVersion: number;
    actorPrincipalId: string; canManageAll: boolean }) {
    if (!validUuid(input.deviceId) || !Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 1) {
      throw new WindowsServiceDeviceError("WINDOWS_SERVICE_REVOKE_INPUT_INVALID", 400);
    }
    return this.client.transaction(async (client) => {
      const lock = client.kind === "postgres" ? " FOR UPDATE" : "";
      const row = await client.queryOne<DeviceRow>(`
        SELECT * FROM ai_pdm_core.windows_service_devices
        WHERE id=:deviceId AND company_id=:companyId${lock}
      `, input);
      if (!row) throw new WindowsServiceDeviceError("WINDOWS_SERVICE_DEVICE_NOT_FOUND", 404);
      const current = mapDevice(row);
      if (!input.canManageAll && current.ownerPrincipalId !== input.actorPrincipalId) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_DEVICE_FORBIDDEN", 403);
      }
      if (current.status === "revoked") return current;
      if (current.rowVersion !== input.expectedRowVersion) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_VERSION_CONFLICT", 409);
      }
      const revokedAt = await databaseNow(client);
      await client.execute(`
        UPDATE ai_pdm_core.windows_service_devices
        SET status='revoked',instance_id=NULL,revoked_at=:revokedAt,revoked_by=:actorPrincipalId,
          row_version=row_version+1,updated_at=:revokedAt
        WHERE id=:deviceId AND company_id=:companyId AND status='active' AND row_version=:expectedRowVersion
      `, { ...input, revokedAt });
      const updated = await client.queryOne<DeviceRow>("SELECT * FROM ai_pdm_core.windows_service_devices WHERE id=:deviceId", input);
      if (!updated || updated.status !== "revoked") throw new WindowsServiceDeviceError("WINDOWS_SERVICE_VERSION_CONFLICT", 409);
      await new AsyncAuditRepository(client).createAuditLog({
        actorId: input.actorPrincipalId, action: "settings.windows_service.device.revoke",
        companyId: input.companyId, scopeKind: "tenant",
        detail: { deviceId: input.deviceId, beforeStatus: current.status, afterStatus: "revoked", rowVersion: Number(updated.row_version) }
      });
      return mapDevice(updated);
    });
  }

  async enroll(input: {
    enrollmentId: string; code: string; deviceId: string; credentialHash: string;
    name: string; serviceVersion: string; protocolVersion: number; sourceKey: string;
  }) {
    if (!validUuid(input.enrollmentId) || !validUuid(input.deviceId) ||
      !/^[A-Za-z0-9_-]{43}$/u.test(input.code) || !validHash(input.credentialHash) ||
      !validName(input.name) || !validVersion(input.serviceVersion) ||
      input.protocolVersion !== WINDOWS_SERVICE_PROTOCOL_VERSION || !input.sourceKey) {
      throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLL_INPUT_INVALID", 400);
    }
    const rateLimitTime = await databaseNow(this.client);
    await this.applyEnrollmentRateLimit(this.client, "company-jenfu", `source:${input.sourceKey}`, rateLimitTime);
    await this.applyEnrollmentRateLimit(this.client, "company-jenfu", `enrollment:${input.enrollmentId}`, rateLimitTime);
    return this.client.transaction(async (client) => {
      const currentTime = await databaseNow(client);
      const lock = client.kind === "postgres" ? " FOR UPDATE" : "";
      const enrollmentRow = await client.queryOne<EnrollmentRow>(`
        SELECT * FROM ai_pdm_core.windows_service_enrollments WHERE id=:enrollmentId${lock}
      `, input);
      if (!enrollmentRow) throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLLMENT_INVALID", 403);
      const enrollment = mapEnrollment(enrollmentRow);
      if (enrollment.companyId !== "company-jenfu") {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLLMENT_INVALID", 403);
      }
      const suppliedCodeHash = crypto.createHash("sha256").update(input.code, "utf8").digest("hex");
      if (!timingSafeHashEqual(enrollment.codeHash, suppliedCodeHash)) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLLMENT_INVALID", 403);
      }
      if (enrollment.consumedAt) {
        const existing = await client.queryOne<DeviceRow>(
          "SELECT * FROM ai_pdm_core.windows_service_devices WHERE id=:deviceId", { deviceId: enrollment.deviceId }
        );
        if (existing && existing.id === input.deviceId && timingSafeHashEqual(existing.credential_hash, input.credentialHash)) {
          return { device: mapDevice(existing), created: false };
        }
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLLMENT_CONSUMED", 409);
      }
      if (Date.parse(enrollment.expiresAt) <= Date.parse(currentTime)) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLLMENT_EXPIRED", 410);
      }
      if (!(await this.creatorStillAuthorized(client, enrollment, currentTime))) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLLMENT_INVALID", 403);
      }
      const duplicate = await client.queryOne<DeviceRow>(`
        SELECT * FROM ai_pdm_core.windows_service_devices
        WHERE id=:deviceId OR credential_hash=:credentialHash${lock}
      `, input);
      if (duplicate) throw new WindowsServiceDeviceError("WINDOWS_SERVICE_DEVICE_CONFLICT", 409);
      await client.execute(`
        INSERT INTO ai_pdm_core.windows_service_devices
          (id,company_id,name,credential_hash,status,instance_id,service_version,protocol_version,
           owner_principal_id,registered_by,registered_at,row_version,updated_at)
        VALUES (:deviceId,:companyId,:name,:credentialHash,'active',NULL,:serviceVersion,
          :protocolVersion,:registeredBy,:registeredBy,:registeredAt,1,:registeredAt)
      `, {
        ...input, companyId: enrollment.companyId, registeredBy: enrollment.createdBy, registeredAt: currentTime
      });
      await client.execute(`
        UPDATE ai_pdm_core.windows_service_enrollments SET consumed_at=:currentTime,device_id=:deviceId
        WHERE id=:enrollmentId AND consumed_at IS NULL
      `, { ...input, currentTime });
      const consumed = await client.queryOne<EnrollmentRow>(
        "SELECT * FROM ai_pdm_core.windows_service_enrollments WHERE id=:enrollmentId", input
      );
      if (!consumed?.consumed_at || consumed.device_id !== input.deviceId) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_ENROLLMENT_CONSUMED", 409);
      }
      await new AsyncAuditRepository(client).createAuditLog({
        actorId: enrollment.createdBy, action: "settings.windows_service.device.register",
        companyId: enrollment.companyId, scopeKind: "tenant",
        detail: { enrollmentId: enrollment.id, deviceId: input.deviceId, name: input.name,
          serviceVersion: input.serviceVersion, protocolVersion: input.protocolVersion }
      });
      const device = await client.queryOne<DeviceRow>(
        "SELECT * FROM ai_pdm_core.windows_service_devices WHERE id=:deviceId", input
      );
      if (!device) throw new WindowsServiceDeviceError("WINDOWS_SERVICE_DEVICE_WRITE_FAILED", 503);
      return { device: mapDevice(device), created: true };
    }, { isolationLevel: "serializable" });
  }

  async findAuthorizedByCredentialHash(credentialHash: string) {
    if (!validHash(credentialHash)) return null;
    return this.client.transaction(async (snapshot) => {
      const row = await snapshot.queryOne<DeviceRow>(
        "SELECT * FROM ai_pdm_core.windows_service_devices WHERE credential_hash=:credentialHash",
        { credentialHash }
      );
      if (!row || row.status !== "active") return null;
      const device = mapDevice(row);
      const account = await new JenfuPrincipalAccountRepository(snapshot).requireActive(device.ownerPrincipalId);
      if (account.companyId !== device.companyId) return null;
      const identities = await snapshot.query<{
        principal_issuer: string; principal_subject: string; principal_id: string; employee_id: string;
      }>(`
        SELECT principal_issuer,principal_subject,principal_id,employee_id
        FROM orgmaster_contract.v_active_principal_accounts_v1
        WHERE principal_id=:principalId AND employee_id=:employeeId
        ORDER BY principal_issuer,principal_subject
        FETCH FIRST 2 ROWS ONLY
      `, { principalId: account.principalId, employeeId: account.employeeId });
      if (identities.length !== 1 || identities[0].principal_id !== account.principalId ||
          identities[0].employee_id !== account.employeeId) return null;
      await validatePrincipalPublishedGrantSnapshot(snapshot, {
        principalId: account.principalId,
        employeeId: account.employeeId,
        identityIssuer: identities[0].principal_issuer,
        identitySubject: identities[0].principal_subject
      });
      return {
        device,
        credentialHash: row.credential_hash,
        owner: {
          principalId: account.principalId,
          employeeId: account.employeeId,
          pdmUserId: account.pdmUserId,
          companyId: account.companyId,
          identityIssuer: identities[0].principal_issuer,
          identitySubject: identities[0].principal_subject
        }
      };
    }, { readOnly: true, isolationLevel: "repeatable_read" });
  }

  async findActiveJob(input: { companyId: string; workerId: string }): Promise<WindowsServiceActiveJob | null> {
    const row = await this.client.queryOne<{
      kind: "preview" | "recognition" | "probe"; id: string;
      attempt_count: number | string; locked_at: string | Date;
      source_fingerprint: string | null;
    }>(`
      SELECT candidate.kind,candidate.id,candidate.attempt_count,candidate.locked_at,candidate.source_fingerprint
      FROM (
        SELECT 'preview' AS kind,id,attempt_count,locked_at,source_content_hash AS source_fingerprint,1 AS priority
        FROM ai_pdm_core.preview_jobs
        WHERE company_id=:companyId AND status='running' AND locked_by=:workerId
        UNION ALL
        SELECT 'recognition' AS kind,id,attempt_count,locked_at,source_set_fingerprint AS source_fingerprint,2 AS priority
        FROM ai_pdm_core.drawing_recognition_sessions
        WHERE company_id=:companyId AND status='extracting' AND locked_by=:workerId
        UNION ALL
        SELECT 'probe' AS kind,id,attempt_count,locked_at,NULL AS source_fingerprint,0 AS priority
        FROM ai_pdm_core.settings_secret_probe_jobs
        WHERE company_id=:companyId AND status='running' AND locked_by=:workerId
      ) candidate
      ORDER BY candidate.priority,candidate.locked_at,candidate.id LIMIT 1
    `, input);
    if (!row) return null;
    return {
      kind: row.kind,
      id: row.id,
      leaseBasis: {
        attemptCount: Number(row.attempt_count),
        lockedAt: iso(row.locked_at)!,
        ...(row.source_fingerprint ? { sourceFingerprint: row.source_fingerprint } : {})
      }
    };
  }

  async start(input: {
    credentialHash: string; deviceId: string; companyId: string; instanceId: string;
    expectedRowVersion: number; serviceVersion: string; protocolVersion: number;
  }) {
    if (!validUuid(input.instanceId) || !Number.isSafeInteger(input.expectedRowVersion) ||
      input.expectedRowVersion < 1 || !validVersion(input.serviceVersion) ||
      input.protocolVersion !== WINDOWS_SERVICE_PROTOCOL_VERSION) {
      throw new WindowsServiceDeviceError("WINDOWS_SERVICE_START_INPUT_INVALID", 400);
    }
    return this.client.transaction(async (client) => {
      const lock = client.kind === "postgres" ? " FOR UPDATE" : "";
      const row = await client.queryOne<DeviceRow>(`
        SELECT * FROM ai_pdm_core.windows_service_devices
        WHERE id=:deviceId AND company_id=:companyId AND credential_hash=:credentialHash${lock}
      `, input);
      if (!row || row.status !== "active") throw new WindowsServiceDeviceError("WORKER_DEVICE_UNAUTHORIZED", 403);
      const device = mapDevice(row);
      if (device.instanceId === input.instanceId) return device;
      if (device.rowVersion !== input.expectedRowVersion) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_VERSION_CONFLICT", 409);
      }
      const now = await databaseNow(client);
      if (device.instanceId && device.lastSeenAt && Date.parse(device.lastSeenAt) > Date.parse(now) - 30_000) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_INSTANCE_CONFLICT", 409);
      }
      await client.execute(`
        UPDATE ai_pdm_core.windows_service_devices SET instance_id=:instanceId,
          service_version=:serviceVersion,protocol_version=:protocolVersion,last_seen_at=:now,
          row_version=row_version+1,updated_at=:now
        WHERE id=:deviceId AND company_id=:companyId AND credential_hash=:credentialHash
          AND status='active' AND row_version=:expectedRowVersion
      `, { ...input, now });
      const updated = await client.queryOne<DeviceRow>(
        "SELECT * FROM ai_pdm_core.windows_service_devices WHERE id=:deviceId", input
      );
      if (!updated || updated.instance_id !== input.instanceId) {
        throw new WindowsServiceDeviceError("WINDOWS_SERVICE_VERSION_CONFLICT", 409);
      }
      return mapDevice(updated);
    });
  }

  async heartbeat(input: { credentialHash: string; deviceId: string; companyId: string; instanceId: string }) {
    return this.client.transaction(async (client) => {
      const lock = client.kind === "postgres" ? " FOR UPDATE" : "";
      const row = await client.queryOne<DeviceRow>(`
        SELECT * FROM ai_pdm_core.windows_service_devices
        WHERE id=:deviceId AND company_id=:companyId AND credential_hash=:credentialHash${lock}
      `, input);
      if (!row || row.status !== "active" || row.instance_id !== input.instanceId) {
        throw new WindowsServiceDeviceError("WORKER_DEVICE_UNAUTHORIZED", 403);
      }
      const now = await databaseNow(client);
      await client.execute(`
        UPDATE ai_pdm_core.windows_service_devices SET last_seen_at=:now,updated_at=:now
        WHERE id=:deviceId AND company_id=:companyId AND credential_hash=:credentialHash
          AND status='active' AND instance_id=:instanceId
      `, { ...input, now });
      return { ...mapDevice(row), lastSeenAt: now };
    });
  }

  private async applyEnrollmentRateLimit(client: AsyncDatabaseClient, companyId: string, key: string, now: string) {
    const identifierHash = crypto.createHash("sha256").update(`dev125:${key}`).digest("hex");
    const windowCutoff = new Date(Date.parse(now) - 60_000).toISOString();
    const blockedUntil = new Date(Date.parse(now) + 60_000).toISOString();
    await client.execute(RATE_LIMIT_UPSERT, {
      companyId, identifierHash, now, windowCutoff, maxAttempts: 10, blockedUntil
    });
    const row = await client.queryOne<{ blocked_until: string | Date | null }>(`
      SELECT blocked_until FROM employee_login_rate_limits
      WHERE company_id=:companyId AND identifier_hash=:identifierHash
    `, { companyId, identifierHash });
    if (row?.blocked_until && Date.parse(iso(row.blocked_until)!) > Date.parse(now)) {
      throw new WindowsServiceDeviceError("WINDOWS_SERVICE_RATE_LIMITED", 429);
    }
  }

  private async creatorStillAuthorized(client: AsyncDatabaseClient, enrollment: WindowsServiceEnrollment, now: string) {
    if (client.kind !== "postgres") return false;
    const row = await client.queryOne<{ eligible: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM ai_pdm_core.principal_accounts account
        JOIN ai_pdm_core.principal_session_records session
          ON session.principal_id=account.principal_id
          AND session.session_id_hash=:sessionHash
        JOIN LATERAL platform_contract.read_principal_auth_state_v3(account.principal_id) epoch
          ON epoch.principal_id=account.principal_id
        WHERE account.principal_id=:principalId AND account.company_id=:companyId
          AND account.account_status='active' AND account.system_role_enabled
          AND session.revoked_at IS NULL AND session.assurance_level IN ('aal1','aal2')
          AND session.principal_auth_epoch=:authEpoch AND epoch.auth_epoch=:authEpoch
          AND session.lifecycle_version=account.lifecycle_version
          AND session.profile_version=account.profile_version
          AND session.issued_at<=CAST(:now AS timestamptz) AND session.expires_at>CAST(:now AS timestamptz)
          AND (epoch.revoked_before IS NULL OR session.authenticated_at>epoch.revoked_before)
          AND (account.session_invalid_before IS NULL OR session.issued_at>account.session_invalid_before)
      ) AS eligible
    `, {
      sessionHash: enrollment.creatorSessionHash, principalId: enrollment.createdBy,
      companyId: enrollment.companyId, authEpoch: enrollment.creatorAuthEpoch, now,
      identityIssuer: enrollment.creatorIdentityIssuer, identitySubject: enrollment.creatorIdentitySubject
    });
    if (row?.eligible !== true) return false;
    try {
      const account = await new JenfuPrincipalAccountRepository(client).requireActive(enrollment.createdBy);
      if (account.companyId !== enrollment.companyId) return false;
      await validatePrincipalPublishedGrantSnapshot(client, {
        principalId: enrollment.createdBy,
        employeeId: account.employeeId,
        identityIssuer: enrollment.creatorIdentityIssuer,
        identitySubject: enrollment.creatorIdentitySubject
      });
      return true;
    } catch {
      return false;
    }
  }
}

export function windowsServiceRequestHash(input: { companyId: string; requestId: string; codeHash: string }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    contractVersion: "ai-pdm.windows-service-enrollment.v1", operation: "create",
    companyId: input.companyId, requestId: input.requestId, codeHash: input.codeHash
  })).digest("hex");
}

export function windowsServiceCredentialHash(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
