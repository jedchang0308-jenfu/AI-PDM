import type { PdmCompanyContext } from "@/lib/company-context";

export type ExtractorRuntimeProfile = {
  command: string | null;
  args: string | null;
  configured: boolean;
  scope: "company" | "legacy" | "none";
  envKeys: {
    command: string;
    args: string;
  };
};

export type MetadataAdapterProfile = {
  company: PdmCompanyContext;
  metadataExtractor: ExtractorRuntimeProfile;
  cadReferenceExtractor: ExtractorRuntimeProfile;
  warnings: string[];
};

export type PublicMetadataAdapterProfile = {
  company: PdmCompanyContext;
  metadataExtractor: Omit<ExtractorRuntimeProfile, "command" | "args">;
  cadReferenceExtractor: Omit<ExtractorRuntimeProfile, "command" | "args">;
  warnings: string[];
};

type ExtractorEnvPrefix = "PDM_METADATA_EXTRACTOR" | "PDM_CAD_REFERENCE_EXTRACTOR";

export function resolveMetadataAdapterProfile(company: PdmCompanyContext): MetadataAdapterProfile {
  const metadataExtractor = resolveExtractorProfile("PDM_METADATA_EXTRACTOR", company.companyCode);
  const cadReferenceExtractor = resolveExtractorProfile("PDM_CAD_REFERENCE_EXTRACTOR", company.companyCode);
  const warnings: string[] = [];

  if (metadataExtractor.scope === "legacy" || cadReferenceExtractor.scope === "legacy") {
    warnings.push(
      `Using legacy global CAD metadata adapter settings for ${company.companyCode}; configure company-specific extractor env keys before production.`
    );
  }

  if (!metadataExtractor.configured && !cadReferenceExtractor.configured) {
    warnings.push(
      `No company-specific SolidWorks Document Manager or equivalent CAD metadata adapter is configured for ${company.companyCode}; filename hints may be used.`
    );
  }

  return {
    company,
    metadataExtractor,
    cadReferenceExtractor,
    warnings
  };
}

export function serializeMetadataAdapterProfile(profile: MetadataAdapterProfile): PublicMetadataAdapterProfile {
  return {
    company: profile.company,
    metadataExtractor: stripRuntimeSecretFields(profile.metadataExtractor),
    cadReferenceExtractor: stripRuntimeSecretFields(profile.cadReferenceExtractor),
    warnings: profile.warnings
  };
}

function resolveExtractorProfile(prefix: ExtractorEnvPrefix, companyCode: PdmCompanyContext["companyCode"]): ExtractorRuntimeProfile {
  const companyKeys = {
    command: `${prefix}_${companyCode}_CMD`,
    args: `${prefix}_${companyCode}_ARGS`
  };
  const legacyKeys = {
    command: `${prefix}_CMD`,
    args: `${prefix}_ARGS`
  };

  const companyCommand = readEnv(companyKeys.command);
  if (companyCommand) {
    return {
      command: companyCommand,
      args: readEnv(companyKeys.args),
      configured: true,
      scope: "company",
      envKeys: companyKeys
    };
  }

  const legacyCommand = readEnv(legacyKeys.command);
  if (legacyCommand) {
    return {
      command: legacyCommand,
      args: readEnv(legacyKeys.args),
      configured: true,
      scope: "legacy",
      envKeys: legacyKeys
    };
  }

  return {
    command: null,
    args: null,
    configured: false,
    scope: "none",
    envKeys: companyKeys
  };
}

function stripRuntimeSecretFields(profile: ExtractorRuntimeProfile): Omit<ExtractorRuntimeProfile, "command" | "args"> {
  return {
    configured: profile.configured,
    scope: profile.scope,
    envKeys: profile.envKeys
  };
}

function readEnv(key: string) {
  return process.env[key]?.trim() || null;
}
