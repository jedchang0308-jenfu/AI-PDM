import { describe, expect, it } from "vitest";
import { createFallbackCommandMetadata } from "@/lib/platform-command";

describe("legacy command metadata boundary", () => {
  it("does not synthesize a human or system security subject on PostgreSQL", () => {
    for (const pdmUserId of ["profile-one", "system"]) {
      expect(() => createFallbackCommandMetadata({
        databaseKind: "postgres", pdmUserId, organizationId: "company-jenfu",
        commandName: "pdm.numbering.create_official_record"
      })).toThrow("PLATFORM_COMMAND_METADATA_REQUIRED");
    }
  });

  it("keeps a local SQLite fixture actor isolated from production", () => {
    const metadata = createFallbackCommandMetadata({
      databaseKind: "sqlite", pdmUserId: "fixture-profile", organizationId: "fixture-company",
      commandName: "pdm.numbering.create_official_record"
    });
    expect(metadata.actor.principalId).toBe("pdm:fixture-profile");
    expect(metadata.actor.organizationId).toBe("fixture-company");
  });
});
