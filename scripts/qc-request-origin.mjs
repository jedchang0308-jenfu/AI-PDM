#!/usr/bin/env node

import assert from "node:assert/strict";
import { isAllowedRequestOrigin } from "../src/lib/request-origin.ts";

const productionEnv = {
  PDM_PUBLIC_BASE_URL: "https://ai-pdm-prod-9536592944.asia-east1.run.app",
  PDM_RELEASE_CANDIDATE_ORIGIN: "https://candidate-0123456789ab---ai-pdm-prod-9536592944.asia-east1.run.app"
};

function request(origin) {
  return new Request("https://ai-pdm-prod-9536592944.asia-east1.run.app/api/auth/firebase/session", {
    headers: origin ? { origin } : {}
  });
}

assert.equal(isAllowedRequestOrigin(request(productionEnv.PDM_PUBLIC_BASE_URL), productionEnv), true);
assert.equal(
  isAllowedRequestOrigin(request(productionEnv.PDM_RELEASE_CANDIDATE_ORIGIN), productionEnv),
  true
);
assert.equal(
  isAllowedRequestOrigin(request("https://candidate-ffffffffffff---ai-pdm-prod-9536592944.asia-east1.run.app"), productionEnv),
  false
);
assert.equal(isAllowedRequestOrigin(request("https://candidate-0123456789ab---other-service-9536592944.asia-east1.run.app"), productionEnv), false);
assert.equal(isAllowedRequestOrigin(request("https://candidate-01234567-9---ai-pdm-prod-legacy.a.run.app"), productionEnv), false);
assert.equal(isAllowedRequestOrigin(request("http://candidate-0123456789ab---ai-pdm-prod-9536592944.asia-east1.run.app"), productionEnv), false);
assert.equal(isAllowedRequestOrigin(request(""), productionEnv), false);

console.log("Request origin QC: 7/7 passed");
