import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

async function readPackageVersion(packageName) {
  const packagePath = path.join(projectRoot, "node_modules", ...packageName.split("/"), "package.json");
  const value = JSON.parse(await fs.readFile(packagePath, "utf8"));
  if (!value?.version) throw new Error(`DEV_082_OCR_PACKAGE_VERSION_MISSING:${packageName}`);
  return String(value.version);
}

async function sha256(filePath) {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

const pdfjsVersion = await readPackageVersion("pdfjs-dist");
const tesseractVersion = await readPackageVersion("tesseract.js");
const coreVersion = await readPackageVersion("tesseract.js-core");
const assetVersion = `pdfjs-${pdfjsVersion}_tesseract-${tesseractVersion}`;
const generatedRoot = path.resolve(projectRoot, "public", "generated", "dev-082-ocr");
const outputRoot = path.resolve(generatedRoot, assetVersion);
if (!outputRoot.startsWith(`${generatedRoot}${path.sep}`)) throw new Error("DEV_082_OCR_ASSET_OUTPUT_BOUNDARY_INVALID");
await fs.rm(outputRoot, { recursive: true, force: true });
await fs.mkdir(path.join(outputRoot, "lang"), { recursive: true });
const workerWrapper = `const nativeError = console.error.bind(console);
console.error = (...values) => {
  const message = values.map((value) => String(value)).join(" ");
  if (/^Warning: Parameter not found: [A-Za-z0-9_]+$/u.test(message)) {
    console.warn(...values);
    return;
  }
  if (/^Estimating resolution as [0-9]+$/u.test(message)) {
    console.debug(...values);
    return;
  }
  nativeError(...values);
};
importScripts("./worker.min.js");
`;

const files = [
  {
    source: path.join(projectRoot, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
    target: path.join(outputRoot, "pdf.worker.min.mjs")
  },
  {
    source: path.join(projectRoot, "node_modules", "tesseract.js", "dist", "worker.min.js"),
    target: path.join(outputRoot, "worker.min.js")
  },
  {
    source: path.join(projectRoot, "node_modules", "tesseract.js", "dist", "worker.min.js.LICENSE.txt"),
    target: path.join(outputRoot, "worker.min.js.LICENSE.txt")
  },
  {
    source: path.join(projectRoot, "node_modules", "tesseract.js-core", "tesseract-core-lstm.wasm.js"),
    target: path.join(outputRoot, "tesseract-core-lstm.wasm.js")
  },
  {
    source: path.join(projectRoot, "node_modules", "tesseract.js-core", "LICENSE"),
    target: path.join(outputRoot, "tesseract-core.LICENSE.txt")
  },
  {
    source: path.join(projectRoot, "node_modules", "@tesseract.js-data", "chi_tra", "4.0.0_best_int", "chi_tra.traineddata.gz"),
    target: path.join(outputRoot, "lang", "chi_tra.traineddata.gz")
  },
  {
    source: path.join(projectRoot, "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
    target: path.join(outputRoot, "lang", "eng.traineddata.gz")
  }
];

const manifestFiles = [];
const workerWrapperPath = path.join(outputRoot, "worker-wrapper.js");
await fs.writeFile(workerWrapperPath, workerWrapper, "utf8");
manifestFiles.push({
  path: "worker-wrapper.js",
  bytes: Buffer.byteLength(workerWrapper),
  sha256: crypto.createHash("sha256").update(workerWrapper).digest("hex")
});
for (const file of files) {
  const sourceBytes = await fs.readFile(file.source);
  await fs.writeFile(file.target, sourceBytes);
  manifestFiles.push({
    path: path.relative(outputRoot, file.target).replaceAll("\\", "/"),
    bytes: sourceBytes.byteLength,
    sha256: crypto.createHash("sha256").update(sourceBytes).digest("hex")
  });
}

const manifest = {
  schemaVersion: "dev-082-ocr-assets.v1",
  assetVersion,
  packages: {
    pdfjsDist: pdfjsVersion,
    tesseractJs: tesseractVersion,
    tesseractJsCore: coreVersion,
    chiTraData: await readPackageVersion("@tesseract.js-data/chi_tra"),
    engData: await readPackageVersion("@tesseract.js-data/eng")
  },
  files: manifestFiles
};
const manifestPath = path.join(outputRoot, "manifest.json");
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

for (const item of manifest.files) {
  const actual = await sha256(path.join(outputRoot, item.path));
  if (actual !== item.sha256) throw new Error(`DEV_082_OCR_ASSET_HASH_MISMATCH:${item.path}`);
}

process.stdout.write(`${JSON.stringify({ output: path.relative(projectRoot, outputRoot), ...manifest }, null, 2)}\n`);
