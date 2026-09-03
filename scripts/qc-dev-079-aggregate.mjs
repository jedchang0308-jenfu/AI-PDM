#!/usr/bin/env node

import { runDev115Aggregate } from "./qc-dev-115-aggregate-lib.mjs";

const tsArgs = ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"];
runDev115Aggregate({
  devId: "DEV-079",
  registryFile: ".ai-doc/qa/dev-079-current-case-registry.json",
  denominator: 42,
  children: [
    { id: "contract", args: ["scripts/qc-dev-079-contract.mjs"] },
    { id: "layout-browser", args: ["scripts/qc-dev-079-layout-browser.mjs"] },
    { id: "recognition-browser", args: ["scripts/qc-dev-079-recognition-layout-browser.mjs"] },
    { id: "owner-invariant", args: [...tsArgs, "scripts/qc-dev-079-owner-invariant.mjs"] },
    { id: "owner-invariant-postgres", args: [...tsArgs, "scripts/qc-dev-079-owner-invariant-postgres.mjs"] },
    { id: "dev087-negative", args: [...tsArgs, "scripts/qc-dev-087-capability-negative.mjs"] }
  ]
});
