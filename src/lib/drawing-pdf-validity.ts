/** Parse user-provided bytes without rendering, OCR, or producing a derivative. */
export async function isReadableDrawingPdf(bytes: Uint8Array): Promise<boolean> {
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") return false;
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: Uint8Array.from(bytes), stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages < 1) return false;
    for (let page = 1; page <= document.numPages; page++) await document.getPage(page);
    return true;
  } catch {
    return false;
  } finally {
    await task.destroy();
  }
}
