#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";
import {
  isRetryableAuditNetworkFailure,
  PRODUCTION_AUDIT_MAX_ATTEMPTS,
  runProductionDependencyAudit
} from "./run-production-dependency-audit.mjs";

const sink = () => ({ chunks: [], write(value) { this.chunks.push(String(value)); } });

test("only explicit network failures qualify for retry", () => {
  assert.equal(isRetryableAuditNetworkFailure("npm warn audit network timeout at: https://registry.npmjs.org"), true);
  assert.equal(isRetryableAuditNetworkFailure("npm error code ECONNRESET"), true);
  assert.equal(isRetryableAuditNetworkFailure("3 high severity vulnerabilities"), false);
  assert.equal(isRetryableAuditNetworkFailure("npm error audit endpoint returned an error"), false);
});

test("one network timeout retries and then returns the successful audit", async () => {
  const attempts = [
    { status: 1, stdout: "", stderr: "network timeout at: registry" },
    { status: 0, stdout: "found 0 vulnerabilities\n", stderr: "" }
  ];
  const waits = [];
  const stdout = sink();
  const stderr = sink();
  const status = await runProductionDependencyAudit({
    runAttempt: () => attempts.shift(),
    wait: async (milliseconds) => waits.push(milliseconds),
    stdout,
    stderr
  });
  assert.equal(status, 0);
  assert.deepEqual(waits, [1000]);
  assert.match(stderr.chunks.join(""), /attempt=2\/3/u);
});

test("a vulnerability finding fails immediately without retry", async () => {
  let calls = 0;
  const status = await runProductionDependencyAudit({
    runAttempt: () => { calls += 1; return { status: 1, stdout: "3 high severity vulnerabilities", stderr: "" }; },
    wait: async () => assert.fail("must not wait"),
    stdout: sink(),
    stderr: sink()
  });
  assert.equal(status, 1);
  assert.equal(calls, 1);
});

test("persistent network failure stops after the bounded third attempt", async () => {
  let calls = 0;
  const waits = [];
  const status = await runProductionDependencyAudit({
    runAttempt: () => { calls += 1; return { status: 1, stdout: "", stderr: "npm error code ETIMEDOUT" }; },
    wait: async (milliseconds) => waits.push(milliseconds),
    stdout: sink(),
    stderr: sink()
  });
  assert.equal(status, 1);
  assert.equal(calls, PRODUCTION_AUDIT_MAX_ATTEMPTS);
  assert.deepEqual(waits, [1000, 2000]);
});
