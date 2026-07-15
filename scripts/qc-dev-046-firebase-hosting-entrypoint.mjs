#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));
const record = (name, passed) => results.push({ name, passed: Boolean(passed) });

const firebase = json("firebase.json");
const firebaseRc = json(".firebaserc");
const contract = json("config/platform/cloud-run.contract.json");
const runtime = read("infra/google-cloud/staging/runtime.tf");
const variables = read("infra/google-cloud/staging/variables.tf");
const locals = read("infra/google-cloud/staging/locals.tf");
const tfvarsExample = read("infra/google-cloud/staging/terraform.tfvars.example");
const publicFiles = fs.readdirSync(path.join(root, firebase.hosting.public));
const rewrite = firebase.hosting.rewrites?.[0];
const headerMap = new Map(firebase.hosting.headers?.[0]?.headers?.map((item) => [item.key, item.value]));

record("DEV046-HOST-001 staging alias and Hosting site are explicit", firebaseRc.projects?.staging === "jenfu-ai-pdm-stg-361825" && firebase.hosting.site === "jenfu-ai-pdm-stg-361825" && firebaseRc.projects?.default === undefined);
record("DEV046-HOST-002 all paths rewrite to the reviewed Taiwan Cloud Run service", firebase.hosting.rewrites?.length === 1 && rewrite?.source === "**" && rewrite?.run?.serviceId === "ai-pdm-stg" && rewrite?.run?.region === "asia-east1");
record("DEV046-HOST-003 Hosting is the only Firebase deployment product", Object.keys(firebase).length === 1 && Object.keys(firebase).includes("hosting") && !/(?:firestore|storage|functions|apphosting)/iu.test(JSON.stringify(firebase)));
record("DEV046-HOST-004 pinTag and source deployment are absent", rewrite?.run?.pinTag === undefined && firebase.hosting.source === undefined && rewrite?.run?.source === undefined);
record("DEV046-HOST-005 dynamic responses are configured private and no-store", headerMap.get("Cache-Control") === "private, no-store, max-age=0" && headerMap.get("Pragma") === "no-cache" && headerMap.get("X-Content-Type-Options") === "nosniff" && headerMap.get("Referrer-Policy") === "same-origin");
record("DEV046-HOST-006 no static index can shadow the root rewrite", !publicFiles.some((name) => /^index\./iu.test(name)));
record("DEV046-HOST-007 Terraform gateway defaults off and conditionally exposes only staging", variables.includes('variable "enable_firebase_hosting_gateway"') && variables.includes("default     = false") && runtime.includes('"INGRESS_TRAFFIC_ALL"') && runtime.includes('"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"') && runtime.includes("default_uri_disabled = !var.enable_firebase_hosting_gateway"));
record("DEV046-HOST-008 canonical origin and issuer are coupled by a Terraform check", runtime.includes("value = var.runtime_public_base_url") && locals.includes('check "firebase_hosting_gateway_origin_guard"') && locals.includes('"https://${var.staging_project_id}.web.app"') && locals.includes("var.session_issuer == var.runtime_public_base_url"));
record("DEV046-HOST-009 planning defaults preserve the ALB baseline", tfvarsExample.includes("enable_firebase_hosting_gateway = false") && tfvarsExample.includes('runtime_public_base_url         = "https://pdm-stg.jenfu.com.tw"'));
record("DEV046-HOST-010 production still requires ALB custom domain and disabled default URI", contract.productionEdgeBaseline?.type === "external-application-load-balancer" && contract.productionEdgeBaseline?.customDomainRequired === true && contract.productionEdgeBaseline?.cloudRunIngress === "internal-and-cloud-load-balancing" && contract.productionEdgeBaseline?.cloudRunDefaultUrlDisabled === true && contract.productionEdgeBaseline?.firebaseHostingGatewayAllowed === false);
record("DEV046-HOST-011 staging exception keeps Cloud SQL GCS and portable BFF authority unchanged", contract.stagingInternalPilotGateway?.decision === "firebase-hosting-default-domain" && contract.stagingInternalPilotGateway?.firestoreAllowed === false && contract.stagingInternalPilotGateway?.firebaseStorageAllowed === false && contract.stagingInternalPilotGateway?.firebaseFunctionsAllowed === false);

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Firebase Hosting entrypoint QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
