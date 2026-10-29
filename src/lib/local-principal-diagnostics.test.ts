import { afterEach, describe, expect, it, vi } from "vitest";
import { reportLocalPrincipalDiagnostic } from "@/lib/local-principal-diagnostics";

describe("local Principal diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs only stage, error name and stable code in the explicit local development lane", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PDM_LOCAL_PRINCIPAL_SANDBOX", "1");
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("database password=must-not-be-logged"), { code: "42501" });

    reportLocalPrincipalDiagnostic("principal_request_input", error);

    expect(logger).toHaveBeenCalledWith("[ai-pdm-local-principal]", {
      stage: "principal_request_input", name: "Error", code: "42501",
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("must-not-be-logged");
  });

  it("does not log outside the explicit local development lane", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_LOCAL_PRINCIPAL_SANDBOX", "1");
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportLocalPrincipalDiagnostic("principal_guard_state", new Error("private detail"));

    expect(logger).not.toHaveBeenCalled();
  });

  it("replaces non-code messages with a fixed value", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PDM_LOCAL_PRINCIPAL_SANDBOX", "1");
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportLocalPrincipalDiagnostic("principal_guard_evaluator", new Error("private database detail"));

    expect(logger).toHaveBeenCalledWith("[ai-pdm-local-principal]", {
      stage: "principal_guard_evaluator", name: "Error", code: "unclassified",
    });
  });
});
