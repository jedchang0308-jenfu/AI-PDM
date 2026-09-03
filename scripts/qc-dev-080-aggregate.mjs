#!/usr/bin/env node

import { runDev115Aggregate } from "./qc-dev-115-aggregate-lib.mjs";

const tsArgs = ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"];
runDev115Aggregate({
  devId: "DEV-080",
  registryFile: ".ai-doc/qa/dev-080-current-case-registry.json",
  denominator: 12,
  children: [
    { id: "projection", args: [...tsArgs, "scripts/qc-dev-080-status-visibility-projection.mjs"] },
    { id: "contract", args: ["scripts/qc-dev-080-status-visibility-contract.mjs"] },
    { id: "browser", args: ["scripts/qc-dev-080-status-visibility-browser.mjs"] }
  ]
});
