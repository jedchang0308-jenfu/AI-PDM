import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const globals = readProjectFile(root, "src/app/globals.css");
const tokens = readProjectFile(root, "src/app/styles/tokens.css");
const responsive = readProjectFile(root, "src/app/styles/responsive.css");
const layout = readProjectFile(root, "src/app/layout.tsx");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

const styleImportOrder = [
  'import "./styles/tokens.css";',
  'import "./globals.css";',
  'import "./styles/responsive.css";'
].map((statement) => layout.indexOf(statement));

record("CSS-001 layout imports split styles", styleImportOrder.every((index) => index >= 0));
record("CSS-002 layout style import order is tokens-base-responsive", styleImportOrder[0] < styleImportOrder[1] && styleImportOrder[1] < styleImportOrder[2]);
record("CSS-003 globals does not use CSS imports", !globals.includes("@import "));
record("CSS-004 globals avoids cascade-layer dependency", !globals.includes("@layer "));
record("CSS-005 globals no longer owns root tokens", !globals.includes(":root {"));
record(
  "CSS-006 retired numbering request CSS is absent from active stylesheets",
  !globals.includes("numbering-request-") && !responsive.includes("numbering-request-")
);
record("CSS-007 tokens define colors", ["--bg", "--panel", "--text", "--accent", "--danger", "--success"].every((token) => tokens.includes(token)));
record("CSS-008 tokens define spacing", ["--space-1", "--space-2", "--space-3", "--space-4", "--space-5"].every((token) => tokens.includes(token)));
record("CSS-009 tokens define typography", tokens.includes("--font-sans") && tokens.includes("--font-mono"));
record("CSS-010 tokens define z-index scale", ["--z-table-header", "--z-filter-menu", "--z-mobile-chat-toggle", "--z-mobile-chat-panel"].every((token) => tokens.includes(token)));
record("CSS-011 responsive owns mobile rules", responsive.includes("@media (max-width: 560px)") && responsive.includes("@media (max-width: 640px)"));
record("CSS-012 responsive owns print rules", responsive.includes("@media print"));
record("CSS-013 responsive preserves mobile chat viewport units", responsive.includes("100dvw") && responsive.includes("100dvh") && responsive.includes("82dvh"));
record(
  "CSS-014 active surfaces retain tokenized z-index usage",
  ["var(--z-filter-menu)", "var(--z-detail-overlay)", "var(--z-mobile-chat-toggle)", "var(--z-mobile-chat-panel)"].every((token) => `${globals}\n${responsive}`.includes(token))
);

console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
