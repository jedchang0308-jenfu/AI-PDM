import { describe, expect, it } from "vitest";
import { pdfDocumentCanvasPlan } from "@/components/pdf-document-viewport";

describe("full PDF canvas output bounds preserve the complete page", () => {
  it("fits a landscape drawing without changing its aspect ratio", () => {
    const plan = pdfDocumentCanvasPlan(842, 595, 700, 1, 2);
    expect(plan.cssWidth).toBeCloseTo(700); expect(plan.cssWidth / plan.cssHeight).toBeCloseTo(842 / 595);
    expect(plan.pixelWidth).toBe(1400); expect(plan.pixelHeight).toBeLessThanOrEqual(990);
  });
  it("allows internal horizontal scrolling while bounding an extreme page buffer", () => {
    const plan = pdfDocumentCanvasPlan(10000, 100000, 10000, 4, 8);
    expect(plan.cssWidth).toBe(40000); expect(plan.cssHeight).toBe(400000);
    expect(plan.pixelWidth).toBeLessThanOrEqual(8192); expect(plan.pixelHeight).toBeLessThanOrEqual(8192);
    expect(plan.pixelWidth * plan.pixelHeight).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(plan.outputScale).toBeLessThan(1);
  });
  it.each([0, -1, NaN, Infinity])("rejects an invalid page dimension %s", width => {
    expect(() => pdfDocumentCanvasPlan(width, 595, 300, 1, 1)).toThrow("invalid_pdf_page_dimensions");
  });
});
