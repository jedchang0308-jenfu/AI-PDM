#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function isDigestPinned(value) {
  return typeof value === "string" && /@sha256:[a-f0-9]{64}$/u.test(value);
}

const packageJson = json("package.json");
const packageLock = json("package-lock.json");
const support = json("config/platform/runtime-support.json");
const cloudRun = json("config/platform/cloud-run.contract.json");
const cache = json("config/platform/edge-cache-policy.json");
const nextConfig = read("next.config.mjs");
const dockerfile = read("Dockerfile");
const infraReadme = read("infra/google-cloud/README.md");

record(
  "DEV046-1A-001 Next.js is exact and lockfile-aligned",
  /^\d+\.\d+\.\d+$/u.test(packageJson.dependencies.next) &&
    packageLock.packages[""].dependencies.next === packageJson.dependencies.next &&
    packageLock.packages["node_modules/next"].version === packageJson.dependencies.next
);
record("DEV046-1A-002 Node 24 LTS support range is pinned", packageJson.engines.node === ">=24.11.0 <25" && support.node.major === 24 && support.node.releaseLine.includes("LTS"));
record("DEV046-1A-003 standalone output is enabled", nextConfig.includes('output: "standalone"') && support.container.nextOutput === "standalone");
record(
  "DEV046-1A-004 base image is immutable and shared by all stages",
  isDigestPinned(support.container.baseImage) &&
    dockerfile.includes(`ARG NODE_IMAGE=${support.container.baseImage}`) &&
    (dockerfile.match(/FROM \$\{NODE_IMAGE\}/gu) ?? []).length === 4 &&
    ["dependencies", "builder", "migration-runner", "runner"].every((stage) => dockerfile.includes(`FROM \${NODE_IMAGE} AS ${stage}`))
);
record("DEV046-1A-005 runtime is non-root and listens on Cloud Run port", dockerfile.includes("USER nextjs") && dockerfile.includes("HOSTNAME=0.0.0.0") && dockerfile.includes("PORT=8080") && cloudRun.service.hostname === "0.0.0.0" && cloudRun.service.port === 8080);
record("DEV046-1A-006 build has no private database dependency", dockerfile.includes("PDM_DB_PROVIDER=sqlite") && !/PDM_(?:POSTGRES_URL|CLOUD_SQL|SUPABASE_SERVICE_ROLE_KEY)/u.test(dockerfile));
record(
  "DEV046-1A-007 Cloud Run region, bounded scale and production ingress modes are explicit",
  cloudRun.service.region === "asia-east1" &&
    cloudRun.service.maxInstances === 2 &&
    cloudRun.service.containerConcurrency === 20 &&
    cloudRun.productionEdgeBaseline?.cloudRunIngress === "all" &&
    cloudRun.productionInternalPilotGateway?.cloudRunIngress === "all"
);
record(
  "DEV046-1A-008 Firebase Hosting is the active prelaunch edge and custom-domain ALB is deferred",
  cloudRun.edge.type === "firebase-hosting-cloud-run-rewrite" &&
    cloudRun.edge.backend === "cloud-run-service" &&
    cloudRun.edge.serverlessNegRegion === "asia-east1" &&
    cloudRun.productionEdgeBaseline?.type === "firebase-hosting-cloud-run-rewrite" &&
    cloudRun.productionEdgeBaseline?.customDomainRequired === false &&
    cloudRun.productionEdgeBaseline?.externalApplicationLoadBalancerProvisioned === false &&
    cloudRun.futureCustomDomainEdge?.status === "deferred" &&
    cloudRun.productionInternalPilotGateway?.canonicalOrigin === "https://jenfu-ai-pdm-prod.web.app" &&
    cloudRun.productionInternalPilotGateway?.directRunAppOriginSessionExchange === "denied-when-origin-is-run-app"
);
record("DEV046-1A-009 Cloud SQL proxy sidecar image is immutable", cloudRun.databaseSidecar.mode === "cloud-sql-auth-proxy" && isDigestPinned(cloudRun.databaseSidecar.image) && cloudRun.databaseSidecar.privateIp === true && cloudRun.databaseSidecar.automaticIamDatabaseAuthentication === true);
record("DEV046-1A-010 release rejects source push and automatic traffic", cloudRun.release.sourceDeployAllowed === false && cloudRun.release.applicationImageDigestRequired === true && cloudRun.release.candidateReceivesTrafficOnDeploy === false && cloudRun.release.promotion === "manual-after-smoke" && infraReadme.includes("zero traffic"));
record("DEV046-1A-011 CDN allowlist contains only hashed Next assets", cache.default === "bypass" && cache.allow.length === 1 && cache.allow[0].path === "/_next/static/**" && cache.allow[0].requiredResponseHeader.includes("immutable"));
record("DEV046-1A-012 CDN denies auth, cookies, APIs and sessions", ["/api/**", "responses-with-set-cookie", "requests-with-cookie", "requests-with-authorization", "authenticated-html", "session-sensitive-response"].every((value) => cache.deny.includes(value)) && cache.cdn.serveStaleSeconds === 0);
record("DEV046-1A-013 API responses explicitly bypass shared cache", nextConfig.includes('source: "/api/:path*"') && nextConfig.includes("private, no-store") && nextConfig.includes("Cookie, Authorization"));
record("DEV046-1A-014 Phase 1 forbids live resources and credentials", Object.values(cloudRun.phase1Guard).every((allowed) => allowed === false));
record("DEV046-1A-015 deployment documentation contains no executable source deploy", !/gcloud\s+run\s+deploy[\s\S]*--source/iu.test(infraReadme));
record(
  "DEV046-1A-016 non-root runtime fallbacks use ephemeral writable paths only",
  dockerfile.includes("PDM_DATA_DIR=/tmp/ai-pdm/data") &&
    dockerfile.includes("PDM_REPOSITORY_DIR=/tmp/ai-pdm/repository") &&
    cloudRun.service.ephemeralCompatibilityPaths.data === "/tmp/ai-pdm/data" &&
    cloudRun.service.ephemeralCompatibilityPaths.repository === "/tmp/ai-pdm/repository" &&
    cloudRun.service.ephemeralCompatibilityPaths.formalAuthorityAllowed === false
);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Phase 1A QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
