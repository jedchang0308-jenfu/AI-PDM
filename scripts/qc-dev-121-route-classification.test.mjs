import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyOpenSwxSchedulerRoute } from "./qc-dev-121-route-classification.mjs";
const path = "src/app/api/openswx-metadata-dispatch/recover/route.ts";
const route = readFileSync(new URL("../" + path, import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/lib/openswx-metadata-dispatch-auth.ts", import.meta.url), "utf8");
test("only the exact recovery POST with actual Google signature/default verifier and fixed purpose is classified", () => {
  assert.equal(classifyOpenSwxSchedulerRoute(path, "POST", route, auth), true);
  for (const [p, method] of [[path, "GET"], [path.replace("recover", "arbitrary"), "POST"], ["src/app/api/sibling/recover/route.ts", "POST"]]) assert.equal(classifyOpenSwxSchedulerRoute(p, method, route, auth), false);
});
test("Bearer text/helper naming/mock verification never substitutes for signature, exact identity and freshness", () => {
  assert.throws(() => classifyOpenSwxSchedulerRoute(path, "POST", 'Bearer authenticateOpenSwxScheduler(request)', auth), /required boundary/u);
  for (const marker of ["google.verifyIdToken", "verify: Verify = verifyGoogle", "c.sub !== subject", "c.aud !== OPENSWX_SCHEDULER_AUDIENCE", "x-cloudscheduler-scheduletime"]) assert.throws(() => classifyOpenSwxSchedulerRoute(path, "POST", route, auth.replace(marker, "removed")), /required boundary/u);
  assert.throws(() => classifyOpenSwxSchedulerRoute(path, "POST", route.replace("authenticateOpenSwxScheduler(request);", "authenticateOpenSwxScheduler(request, mocked);"), auth), /required boundary/u);
});
