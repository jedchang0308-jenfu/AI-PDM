#!/usr/bin/env node

import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildStorageMigrationRunbook } from "./generate-file-storage-migration-runbook.mjs";

const PROVIDER_PROFILES = {
  cloudflare_r2: {
    label: "Cloudflare R2",
    defaultRegion: "auto",
    forcePathStyle: true,
    endpointExample: "https://<account-id>.r2.cloudflarestorage.com"
  },
  aws_s3: {
    label: "AWS S3",
    defaultRegion: "ap-northeast-1",
    forcePathStyle: false,
    endpointExample: "https://s3.<region>.amazonaws.com"
  },
  backblaze_b2: {
    label: "Backblaze B2",
    defaultRegion: "us-west-004",
    forcePathStyle: true,
    endpointExample: "https://s3.<region>.backblazeb2.com"
  },
  wasabi: {
    label: "Wasabi",
    defaultRegion: "ap-northeast-1",
    forcePathStyle: true,
    endpointExample: "https://s3.<region>.wasabisys.com"
  },
  nas_gateway: {
    label: "NAS S3 Gateway",
    defaultRegion: "local",
    forcePathStyle: true,
    endpointExample: "https://nas-s3-gateway.local"
  }
};

function resolveProfile(value) {
  const profile = value || "cloudflare_r2";
  if (!Object.hasOwn(PROVIDER_PROFILES, profile)) {
    throw new Error(`Unsupported S3-compatible dry-run provider profile: ${profile}`);
  }
  return profile;
}

function buildTargetUri(bucket, key) {
  return `s3-compatible://${bucket}/${key}`;
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM S3-compatible Storage Dry-run",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Target Profile",
    "",
    `- Profile: ${report.target.profile}`,
    `- Label: ${report.target.label}`,
    `- Bucket: ${report.target.bucket}`,
    `- Prefix: ${report.target.prefix}`,
    `- Region: ${report.target.region}`,
    `- Force path style: ${report.target.forcePathStyle}`,
    "",
    "## Summary",
    "",
    `- Planned objects: ${report.summary.plannedCount}`,
    `- Planned bytes: ${report.summary.plannedBytes}`,
    `- Blocked objects: ${report.summary.blockedCount}`,
    `- Skipped objects: ${report.summary.skippedCount}`,
    "",
    "## Guardrails",
    "",
    `- Dry-run only: ${report.assumptions.dryRunOnly}`,
    `- No provider requests: ${report.assumptions.noProviderRequests}`,
    `- No credentials required: ${report.assumptions.noCredentialsRequired}`,
    `- No metadata pointers updated: ${report.assumptions.noMetadataPointersUpdated}`,
    "",
    "## Planned Objects",
    ""
  ];

  if (report.planned.length === 0) {
    lines.push("- No local objects were eligible for S3-compatible migration planning.");
  } else {
    for (const item of report.planned) {
      lines.push(`- ${item.source}/${item.id}: ${item.filename} -> ${item.targetUri} (${item.sha256})`);
    }
  }

  if (report.blocked.length > 0) {
    lines.push("", "## Blockers", "");
    for (const item of report.blocked) {
      lines.push(`- ${item.source}/${item.id}: ${item.filename ?? "-"} (${item.reason})`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function buildS3CompatibleDryRun(options = {}) {
  const env = options.env ?? process.env;
  const profile = resolveProfile(options.profile ?? env.PDM_S3_COMPATIBLE_DRY_RUN_PROFILE);
  const profileConfig = PROVIDER_PROFILES[profile];
  const bucket = options.bucket ?? env.PDM_S3_COMPATIBLE_DRY_RUN_BUCKET ?? `${profile.replaceAll("_", "-")}-pdm-hot`;
  const prefix = options.prefix ?? env.PDM_S3_COMPATIBLE_DRY_RUN_PREFIX ?? "ai-pdm";
  const region = options.region ?? env.PDM_S3_COMPATIBLE_DRY_RUN_REGION ?? profileConfig.defaultRegion;
  const runbook = buildStorageMigrationRunbook({
    ...options,
    targetProvider: "s3_compatible",
    targetBucket: bucket,
    targetPrefix: prefix
  });
  const planned = runbook.plannedBatches.flatMap((batch) =>
    batch.objects.map((item) => ({
      ...item,
      providerProfile: profile,
      targetUri: buildTargetUri(bucket, item.targetKey),
      endpointRequired: true,
      credentialRequiredForExecution: true
    }))
  );

  return {
    reportType: "file-storage-s3-compatible-dry-run",
    generatedAt: new Date().toISOString(),
    assumptions: {
      dryRunOnly: true,
      noProviderRequests: true,
      noCredentialsRequired: true,
      noFilesCopied: true,
      noFilesDeleted: true,
      noMetadataPointersUpdated: true,
      liveExecutionRequiresSeparateApproval: true
    },
    target: {
      provider: "s3_compatible",
      profile,
      label: profileConfig.label,
      bucket,
      prefix,
      region,
      forcePathStyle: profileConfig.forcePathStyle,
      endpointExample: profileConfig.endpointExample,
      pointerScheme: "s3-compatible://"
    },
    requiredServerEnvForExecution: [
      "PDM_STORAGE_PROVIDER=s3_compatible",
      "PDM_S3_COMPATIBLE_ENDPOINT",
      "PDM_S3_COMPATIBLE_REGION",
      "PDM_S3_COMPATIBLE_BUCKET",
      "PDM_S3_COMPATIBLE_ACCESS_KEY_ID",
      "PDM_S3_COMPATIBLE_SECRET_ACCESS_KEY",
      "PDM_S3_COMPATIBLE_LIVE_ENABLED=1"
    ],
    sourceRunbook: {
      reportType: runbook.reportType,
      generatedAt: runbook.generatedAt,
      readiness: runbook.readiness,
      summary: runbook.summary
    },
    summary: {
      plannedCount: runbook.summary.plannedCount,
      plannedBytes: runbook.summary.plannedBytes,
      blockedCount: runbook.summary.blockedCount,
      skippedCount: runbook.summary.skippedCount,
      batchCount: runbook.summary.batchCount
    },
    planned,
    blocked: runbook.blocked,
    skipped: runbook.skipped,
    pointerRollbackPlan: runbook.pointerRollbackPlan
  };
}

export async function writeS3CompatibleDryRun(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fsp.mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-s3-compatible-dry-run.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-s3-compatible-dry-run.md");
  await fsp.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fsp.writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    outputDir: "",
    profile: undefined,
    bucket: undefined,
    prefix: undefined,
    region: undefined,
    batchSize: undefined
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
    else if (arg === "--profile") parsed.profile = argv[++index];
    else if (arg === "--bucket") parsed.bucket = argv[++index];
    else if (arg === "--prefix") parsed.prefix = argv[++index];
    else if (arg === "--region") parsed.region = argv[++index];
    else if (arg === "--batch-size") parsed.batchSize = Number.parseInt(argv[++index] ?? "", 10) || undefined;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildS3CompatibleDryRun({
    profile: args.profile,
    bucket: args.bucket,
    prefix: args.prefix,
    region: args.region,
    batchSize: args.batchSize
  });
  if (args.outputDir) {
    await writeS3CompatibleDryRun(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
