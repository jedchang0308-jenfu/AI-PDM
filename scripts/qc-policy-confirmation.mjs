#!/usr/bin/env node

import { evaluatePolicyConfirmation } from "./policy-confirmation-utils.mjs";

const args = new Set(process.argv.slice(2));
const allowOpen = args.has("--allow-open");
const result = evaluatePolicyConfirmation(process.cwd());

console.log(JSON.stringify({ ...result, allowOpen }, null, 2));

if (!result.ready && !allowOpen) {
  process.exitCode = 1;
}
