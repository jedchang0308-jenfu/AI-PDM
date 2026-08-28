// DEV-101 browser evidence must exercise the normal rendered owner → inbox → review journey.
// Keep this stable entrypoint while the implementation lives in the schema-parametrized runner.
if (!process.argv.some((value) => value.startsWith("--schema="))) process.argv.push("--schema=v2");
await import("./qc-dev-101-owner-flow-browser.mjs");
