import { expect, it } from "vitest";
import { detectCandidateRevisionFileRole } from "./pdm-file-ownership";

it.each(["application/pdf; charset=binary", " Application/PDF ; charset=binary "])("classifies an extensionless source using normalized PDF MIME %s", mimeType => {
  expect(detectCandidateRevisionFileRole({ fileName: "drawing", mimeType })).toEqual({ role: "pdf", source: "system" });
});
it("preserves native extension priority and rejects a PDF-like MIME prefix", () => {
  expect(detectCandidateRevisionFileRole({ fileName: "model.sldprt", mimeType: "application/pdf; charset=binary" })).toEqual({ role: "cad_3d", source: "extension" });
  expect(detectCandidateRevisionFileRole({ fileName: "drawing", mimeType: "application/pdfx" })).toEqual({ role: "other", source: "system" });
});
