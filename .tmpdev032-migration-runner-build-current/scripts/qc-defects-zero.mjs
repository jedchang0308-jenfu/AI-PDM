#!/usr/bin/env node

import { evaluateDefectRegister } from "./defect-register-utils.mjs";

const args = new Set(process.argv.slice(2));
const allowOpen = args.has("--allow-open");
const result = evaluateDefectRegister(process.cwd());

const report = {
  ...result,
  allowOpen
};

console.log(JSON.stringify(report, null, 2));

if (!result.ready && !allowOpen) {
  process.exitCode = 1;
}
