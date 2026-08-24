#!/usr/bin/env node

const args = parseArgs(process.argv.slice(2));
const filePath = args.file || process.argv.at(-1) || "";
const filename = filePath.split(/[\\/]/u).at(-1) || "mock.sldasm";

function parseArgs(argv) {
  const parsed = { kind: "", file: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--kind") parsed.kind = argv[++index] ?? "";
    else if (arg === "--file") parsed.file = argv[++index] ?? "";
    else if (!arg.startsWith("--")) parsed.file = arg;
  }
  return parsed;
}

if (args.kind === "metadata") {
  process.stdout.write(
    JSON.stringify({
      metadata: {
        drawing_number: "QC-EXT-001",
        part_number: "P-QC-EXT-001",
        part_name: "External Extractor Assembly",
        revision: "C",
        material: "AL6061",
        surface_finish: "Anodized",
        document_type: "Assembly"
      }
    })
  );
} else if (args.kind === "references") {
  process.stdout.write(
    JSON.stringify({
      references: [
        {
          sourceFilename: filename,
          referencedFilename: "QC-EXT-CHILD-001.sldprt",
          referencedPartNumber: "P-QC-EXT-CHILD-001",
          referencedDrawingNumber: "QC-EXT-CHILD-001",
          referencedRevision: "A",
          referenceType: "unknown",
          quantity: 3,
          extractionMethod: "mock_external_extractor",
          confidence: "high"
        }
      ]
    })
  );
} else {
  process.stderr.write("Expected --kind metadata or --kind references\n");
  process.exit(2);
}
