#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const record = (name, passed) => results.push({ name, passed: Boolean(passed) });

const firebasePath = "config/platform/firebase-hosting.production.json";
const firebase = json(firebasePath);
const firebaseRc = json(".firebaserc");
const contract = json("config/platform/cloud-run.contract.json");
const runtime = read("infra/google-cloud/production/runtime.tf");
const variables = read("infra/google-cloud/production/variables.tf");
const locals = read("infra/google-cloud/production/locals.tf");
const publicDirectory = path.join(root, firebase.hosting.public);
const publicFiles = fs.existsSync(publicDirectory) ? fs.readdirSync(publicDirectory) : [];
const fallbackPage = publicFiles.includes("404.html") ? read(path.join(firebase.hosting.public, "404.html")) : "";
const rewrite = firebase.hosting.rewrites?.[0];
const headerMap = new Map(firebase.hosting.headers?.[0]?.headers?.map((item) => [item.key, item.value]));

record(
  "DEV046-HOST-001 Firebase aliases are explicit and the retired staging root config is absent",
  firebaseRc.projects?.staging === "jenfu-ai-pdm-stg-361825" &&
    firebaseRc.projects?.production === "jenfu-ai-pdm-prod" &&
    firebaseRc.projects?.default === undefined &&
    !fs.existsSync(path.join(root, "firebase.json"))
);
record(
  "DEV046-HOST-002 all paths rewrite to the reviewed Taiwan production Cloud Run service",
  firebase.hosting.site === "jenfu-ai-pdm-prod" &&
    firebase.hosting.rewrites?.length === 1 &&
    rewrite?.source === "**" &&
    rewrite?.run?.serviceId === "ai-pdm-prod" &&
    rewrite?.run?.region === "asia-east1"
);
record(
  "DEV046-HOST-003 Hosting is the only Firebase deployment product",
  Object.keys(firebase).length === 1 &&
    Object.keys(firebase).includes("hosting") &&
    !/(?:firestore|storage|functions|apphosting)/iu.test(JSON.stringify(firebase))
);
record(
  "DEV046-HOST-004 traffic pinning and source deployment are disabled",
  rewrite?.run?.pinTag === false && firebase.hosting.source === undefined && rewrite?.run?.source === undefined
);
record(
  "DEV046-HOST-005 dynamic responses are private and no-store",
  headerMap.get("Cache-Control") === "private, no-store, max-age=0" &&
    headerMap.get("Pragma") === "no-cache" &&
    headerMap.get("X-Content-Type-Options") === "nosniff" &&
    headerMap.get("Referrer-Policy") === "same-origin"
);
record(
  "DEV046-HOST-006 clean checkout contains a non-shadowing Hosting public directory",
  fs.existsSync(publicDirectory) &&
    !publicFiles.some((name) => /^index\./iu.test(name)) &&
    fallbackPage.includes('name="robots" content="noindex, nofollow"')
);
record(
  "DEV046-HOST-007 Terraform gateway defaults off and conditionally exposes only the reviewed pilot",
  variables.includes('variable "enable_firebase_hosting_gateway"') &&
    variables.includes("default     = false") &&
    runtime.includes('var.enable_firebase_hosting_gateway ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"') &&
    runtime.includes("default_uri_disabled = !var.enable_firebase_hosting_gateway")
);
record(
  "DEV046-HOST-008 canonical origin and issuer are coupled by the production guard",
  runtime.includes("value = var.runtime_public_base_url") &&
    runtime.includes("value = var.session_issuer") &&
    locals.includes("firebase_hosting_gateway_ready") &&
    locals.includes('var.runtime_public_base_url == local.firebase_hosting_origin') &&
    locals.includes('var.session_issuer == local.firebase_hosting_origin') &&
    locals.includes('!can(regex("stg|staging", var.runtime_public_base_url))')
);
record(
  "DEV046-HOST-009 Terraform defaults preserve the custom-domain baseline",
  variables.includes('default     = "https://pdm.jenfu.com.tw"') &&
    variables.includes('"https://jenfu-ai-pdm-prod.web.app"') &&
    variables.includes('default     = ""')
);
record(
  "DEV046-HOST-010 production pilot exception preserves the future ALB baseline",
  contract.productionEdgeBaseline?.type === "external-application-load-balancer" &&
    contract.productionEdgeBaseline?.status === "future-cutover-baseline-after-internal-pilot" &&
    contract.productionInternalPilotGateway?.decision === "firebase-hosting-default-domain-no-dns" &&
    contract.productionInternalPilotGateway?.canonicalOrigin === "https://jenfu-ai-pdm-prod.web.app" &&
    contract.productionInternalPilotGateway?.directRunAppOriginSessionExchange === "denied-when-origin-is-run-app"
);
record(
  "DEV046-HOST-011 Hosting keeps Cloud SQL, GCS and portable BFF authority unchanged",
  contract.productionInternalPilotGateway?.firebaseHostingSite === "jenfu-ai-pdm-prod" &&
    contract.productionInternalPilotGateway?.firestoreAllowed === false &&
    contract.productionInternalPilotGateway?.firebaseStorageAllowed === false &&
    contract.productionInternalPilotGateway?.firebaseFunctionsAllowed === false &&
    contract.productionInternalPilotGateway?.gcsFileWorkflowEnabled === false
);

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Firebase Hosting entrypoint QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
