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

  async findCurrentPrincipal(pdmUserId: string): Promise<PlatformPrincipalMapping | null> {
    const row = await this.client.queryOne<PrincipalRow>(
      `SELECT platform_principal_id, pdm_user_id, mapping_source, mapping_status, external_subject
       FROM platform_principal_mappings WHERE pdm_user_id = :pdmUserId`,
      { pdmUserId }
    );
    return row ? mapPrincipal(row) : null;
  }

  async findCurrentOrganization(pdmCompanyId: string): Promise<PlatformOrganizationMapping | null> {
    const row = await this.client.queryOne<OrganizationRow>(
      `SELECT platform_organization_id, pdm_company_id, mapping_source, mapping_status, external_organization_key
       FROM platform_organization_mappings WHERE pdm_company_id = :pdmCompanyId`,
      { pdmCompanyId }
    );
    return row ? mapOrganization(row) : null;
  }
}
