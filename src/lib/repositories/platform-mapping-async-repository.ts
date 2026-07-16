import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type PlatformPrincipalMapping = {
  platformPrincipalId: string;
  pdmUserId: string;
  mappingSource: "current_pdm" | "shared_iam";
  mappingStatus: "active" | "suspended" | "retired";
  externalSubject: string | null;
};

export type PlatformOrganizationMapping = {
  platformOrganizationId: string;
  pdmCompanyId: string;
  mappingSource: "current_pdm" | "shared_core";
  mappingStatus: "active" | "suspended" | "retired";
  externalOrganizationKey: string | null;
};

type PrincipalRow = {
  platform_principal_id: string;
  pdm_user_id: string;
  mapping_source: PlatformPrincipalMapping["mappingSource"];
  mapping_status: PlatformPrincipalMapping["mappingStatus"];
  external_subject: string | null;
};

type OrganizationRow = {
  platform_organization_id: string;
  pdm_company_id: string;
  mapping_source: PlatformOrganizationMapping["mappingSource"];
  mapping_status: PlatformOrganizationMapping["mappingStatus"];
  external_organization_key: string | null;
};

function mapPrincipal(row: PrincipalRow): PlatformPrincipalMapping {
  return {
    platformPrincipalId: row.platform_principal_id,
    pdmUserId: row.pdm_user_id,
    mappingSource: row.mapping_source,
    mappingStatus: row.mapping_status,
    externalSubject: row.external_subject
  };
}

function mapOrganization(row: OrganizationRow): PlatformOrganizationMapping {
  return {
    platformOrganizationId: row.platform_organization_id,
    pdmCompanyId: row.pdm_company_id,
    mappingSource: row.mapping_source,
    mappingStatus: row.mapping_status,
    externalOrganizationKey: row.external_organization_key
  };
}

export class PlatformMappingAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async ensureCurrentPrincipal(pdmUserId: string): Promise<PlatformPrincipalMapping> {
    await this.client.execute(
      `
      INSERT INTO platform_principal_mappings (
        platform_principal_id, pdm_user_id, mapping_source, mapping_status, created_at, updated_at
      ) VALUES (:platformPrincipalId, :pdmUserId, 'current_pdm', 'active', :now, :now)
      ON CONFLICT(pdm_user_id) DO NOTHING
      `,
      { platformPrincipalId: `pdm:${pdmUserId}`, pdmUserId, now: new Date().toISOString() }
    );
    const row = await this.client.queryOne<PrincipalRow>(
      `SELECT platform_principal_id, pdm_user_id, mapping_source, mapping_status, external_subject
       FROM platform_principal_mappings WHERE pdm_user_id = :pdmUserId`,
      { pdmUserId }
    );
    if (!row) throw new Error("PLATFORM_PRINCIPAL_MAPPING_READBACK_FAILED");
    return mapPrincipal(row);
  }

  async ensureCurrentOrganization(pdmCompanyId: string): Promise<PlatformOrganizationMapping> {
    await this.client.execute(
      `
      INSERT INTO platform_organization_mappings (
        platform_organization_id, pdm_company_id, mapping_source, mapping_status, created_at, updated_at
      ) VALUES (:platformOrganizationId, :pdmCompanyId, 'current_pdm', 'active', :now, :now)
      ON CONFLICT(pdm_company_id) DO NOTHING
      `,
      { platformOrganizationId: `pdm-company:${pdmCompanyId}`, pdmCompanyId, now: new Date().toISOString() }
    );
    const row = await this.client.queryOne<OrganizationRow>(
      `SELECT platform_organization_id, pdm_company_id, mapping_source, mapping_status, external_organization_key
       FROM platform_organization_mappings WHERE pdm_company_id = :pdmCompanyId`,
      { pdmCompanyId }
    );
    if (!row) throw new Error("PLATFORM_ORGANIZATION_MAPPING_READBACK_FAILED");
    return mapOrganization(row);
  }

  async linkSharedPrincipal(input: {
    platformPrincipalId: string;
    pdmUserId: string;
    externalSubject: string;
  }): Promise<PlatformPrincipalMapping> {
    await this.client.execute(
      `
      UPDATE platform_principal_mappings
      SET platform_principal_id = :platformPrincipalId,
          mapping_source = 'shared_iam',
          mapping_status = 'active',
          external_subject = :externalSubject,
          updated_at = :now
      WHERE pdm_user_id = :pdmUserId
        AND mapping_status <> 'retired'
      `,
      { ...input, now: new Date().toISOString() }
    );
    const row = await this.client.queryOne<PrincipalRow>(
      `SELECT platform_principal_id, pdm_user_id, mapping_source, mapping_status, external_subject
       FROM platform_principal_mappings WHERE pdm_user_id = :pdmUserId`,
      { pdmUserId: input.pdmUserId }
    );
    if (!row) throw new Error("PLATFORM_SHARED_PRINCIPAL_LINK_FAILED");
    return mapPrincipal(row);
  }

  async linkSharedOrganization(input: {
    platformOrganizationId: string;
    pdmCompanyId: string;
    externalOrganizationKey: string;
  }): Promise<PlatformOrganizationMapping> {
    await this.client.execute(
      `
      UPDATE platform_organization_mappings
      SET platform_organization_id = :platformOrganizationId,
          mapping_source = 'shared_core',
          mapping_status = 'active',
          external_organization_key = :externalOrganizationKey,
          updated_at = :now
      WHERE pdm_company_id = :pdmCompanyId
        AND mapping_status <> 'retired'
      `,
      { ...input, now: new Date().toISOString() }
    );
    const row = await this.client.queryOne<OrganizationRow>(
      `SELECT platform_organization_id, pdm_company_id, mapping_source, mapping_status, external_organization_key
       FROM platform_organization_mappings WHERE pdm_company_id = :pdmCompanyId`,
      { pdmCompanyId: input.pdmCompanyId }
    );
    if (!row) throw new Error("PLATFORM_SHARED_ORGANIZATION_LINK_FAILED");
    return mapOrganization(row);
  }
}
