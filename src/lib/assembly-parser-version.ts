/** Versions whose native reference semantics the current server accepts. */
export const SUPPORTED_ASSEMBLY_PARSER_VERSIONS = ["solidworks-document-manager.assembly.v2"] as const;
export const CURRENT_ASSEMBLY_PARSER_VERSION = SUPPORTED_ASSEMBLY_PARSER_VERSIONS[0];
export function isSupportedAssemblyParserVersion(value:unknown):value is (typeof SUPPORTED_ASSEMBLY_PARSER_VERSIONS)[number] {
  return typeof value==="string" && (SUPPORTED_ASSEMBLY_PARSER_VERSIONS as readonly string[]).includes(value);
}
