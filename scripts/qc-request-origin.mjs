#!/usr/bin/env node

import assert from "node:assert/strict";
import { isAllowedRequestOrigin } from "../src/lib/request-origin.ts";

const productionEnv = {
  PDM_PUBLIC_BASE_URL: "https://jenfu-ai-pdm-prod.web.app",
  PDM_CANDIDATE_CLOUD_RUN_SERVICE: "ai-pdm-prod"
};

function request(origin) {
  return new Request("https://ai-pdm-prod-ngxsziu4ha-de.a.run.app/api/auth/firebase/session", {
    headers: origin ? { origin } : {}
  });
}

assert.equal(isAllowedRequestOrigin(request("https://jenfu-ai-pdm-prod.web.app"), productionEnv), true);
assert.equal(
  isAllowedRequestOrigin(request("https://candidate-ea8fb534-32042209211---ai-pdm-prod-ngxsziu4ha-de.a.run.app"), productionEnv),
  true
);
assert.equal(isAllowedRequestOrigin(request("https://ai-pdm-prod-ngxsziu4ha-de.a.run.app"), productionEnv), false);
assert.equal(isAllowedRequestOrigin(request("https://candidate-ea8fb534-32042209211---other-service-ngxsziu4ha-de.a.run.app"), productionEnv), false);
assert.equal(isAllowedRequestOrigin(request("http://candidate-ea8fb534-32042209211---ai-pdm-prod-ngxsziu4ha-de.a.run.app"), productionEnv), false);
assert.equal(isAllowedRequestOrigin(request(""), productionEnv), false);

console.log("Request origin QC: 6/6 passed");
