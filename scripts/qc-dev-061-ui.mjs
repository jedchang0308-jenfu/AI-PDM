import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
function check(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`${id}: ${detail}`);
}
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const preview = read("src/components/drawing-detail-preview.tsx");
const attachmentPanel = read("src/components/master-attachment-panel.tsx");
const detailWorkbench = read("src/components/drawing-workbench.tsx");
const revisions = read("src/app/numbering/revisions/page.tsx");
check("preview-click-target", preview.includes('aria-label={`${media.title}，點擊開啟預覽`}'), "ready preview media opens by clicking the preview itself");
check("preview-button-removed", !attachmentPanel.includes("預覽 PDF") && !attachmentPanel.includes("開啟預覽"), "no standalone preview-open button remains in attachment rows");
check("drawing-reference-manager-removed", !detailWorkbench.includes("authority=\"reference_manager\"") && !detailWorkbench.includes("附件管理"), "drawing detail does not mount a general/reference attachment manager");
check("compact-file-list-persistent", attachmentPanel.includes("master-attachment-file-details") && attachmentPanel.includes("master-attachment-list"), "controlled drawing summary keeps a compact non-collapsed file list");
check("controlled-upload-copy", revisions.includes("加入受控進版包"), "revision UI routes users to the single controlled revision package intake");
check("required-upload-accept", revisions.includes(".SLDDRW,.SLDPRT,.SLDASM"), "revision file picker exposes only the required original 2D and 3D CAD extensions");

console.log(JSON.stringify({ script: "qc-dev-061-ui", passed: checks.length, checks }, null, 2));
