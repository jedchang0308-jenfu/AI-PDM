function sha256Digest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function gitRevision(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
}

function hexSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

export function evaluateCurrentRehearsal({
  evidence,
  projectId,
  instanceName,
  candidateManifestSha256,
  candidateSchemaMigrationCount
}) {
  const restoreConnectionName = evidence?.restore?.connectionName ?? null;
  const authorizedCap = evidence?.authorization?.costCapTwd ?? null;
  const observedCost = evidence?.costGuard?.observedCloudSqlUpperBoundTwd ?? null;
  const conservativeCost = evidence?.costGuard?.conservativeFourHourCloudSqlUpperBoundTwd ?? null;
  const checks = {
    rehearsalSucceeded:
      evidence?.schemaVersion === 1 &&
      evidence?.dev === "DEV-032" &&
      evidence?.gate === "Gate-C2-current-candidate-native-backup-restore-rehearsal" &&
      evidence?.status === "succeeded" &&
      evidence?.productionActionPerformed === true,
    sourceIdentityExact:
      evidence?.source?.projectId === projectId &&
      evidence?.source?.instance === instanceName,
    candidateManifestExact:
      hexSha256(evidence?.candidate?.manifestSha256) &&
      evidence?.candidate?.manifestSha256 === candidateManifestSha256 &&
      evidence?.candidate?.schemaMigrationCount === candidateSchemaMigrationCount,
    exactArtifactProvenance:
      gitRevision(evidence?.candidate?.sourceRevision) &&
      evidence?.candidate?.sourceRevision === evidence?.candidate?.ociRevision &&
      evidence?.candidate?.sourceState === "clean" &&
      sha256Digest(evidence?.candidate?.imageDigest) &&
      evidence?.candidate?.image?.endsWith(`@${evidence?.candidate?.imageDigest}`) === true,
    restoreWasIsolated:
      evidence?.restore?.sourceDistinct === true &&
      evidence?.restore?.targetInstance !== instanceName &&
      evidence?.restore?.state === "RUNNABLE" &&
      evidence?.restore?.privateOnly === true &&
      evidence?.restore?.backupStatus === "SUCCESSFUL" &&
      evidence?.baseline?.target === restoreConnectionName,
    migrationFirstPassSucceeded:
      evidence?.migration?.firstPassSucceeded === true &&
      Array.isArray(evidence?.migration?.firstPassAppliedVersions),
    migrationRerunIdempotent:
      evidence?.migration?.secondPassSucceeded === true &&
      evidence?.migration?.idempotentRerunAppliedVersions === 0 &&
      Array.isArray(evidence?.migration?.secondPassAppliedVersions) &&
      evidence.migration.secondPassAppliedVersions.length === 0,
    reconciliationPassed:
      evidence?.reconciliation?.mode === "restore" &&
      evidence?.reconciliation?.readOnly === true &&
      evidence?.reconciliation?.allChecksPassed === true &&
      evidence?.reconciliation?.migrationCount === candidateSchemaMigrationCount &&
      evidence?.reconciliation?.snapshotUnchanged === true &&
      hexSha256(evidence?.reconciliation?.sourceSnapshotSha256) &&
      evidence.reconciliation.sourceSnapshotSha256 === evidence?.reconciliation?.restoreSnapshotSha256,
    noEvidenceBlockers:
      Array.isArray(evidence?.blockers) &&
      evidence.blockers.length === 0,
    productionSourceProtected:
      evidence?.authorization?.productionSourceDatabaseMutationAllowed === false &&
      evidence?.source?.mutationPerformed === false &&
      evidence?.source?.metadataUnchanged === true &&
      hexSha256(evidence?.source?.metadataSha256Before) &&
      evidence.source.metadataSha256Before === evidence?.source?.metadataSha256After &&
      evidence?.source?.operationsDuringGate === 0 &&
      evidence?.cleanup?.productionSourceDatabaseModified === false,
    restoreTargetDeleted:
      evidence?.restore?.deleted === true &&
      evidence?.restore?.postDeleteInstanceCount === 0 &&
      evidence?.cleanup?.restoreTargetDeleted === true,
    cloudRunJobRestored:
      evidence?.jobRestoration?.originalImageRestored === true &&
      evidence?.jobRestoration?.originalDefaultSourceTargetRestored === true &&
      evidence?.jobRestoration?.specRestored === true &&
      hexSha256(evidence?.jobRestoration?.reconstructedOriginalSpecSha256) &&
      evidence.jobRestoration.reconstructedOriginalSpecSha256 === evidence?.jobRestoration?.expectedOriginalSpecSha256 &&
      evidence?.cleanup?.cloudRunJobDefinitionRestored === true,
    costWithinAuthorization:
      evidence?.costGuard?.currency === "TWD" &&
      Number.isFinite(authorizedCap) &&
      authorizedCap === 100 &&
      evidence?.costGuard?.authorizedCap === authorizedCap &&
      Number.isFinite(observedCost) &&
      observedCost <= authorizedCap &&
      Number.isFinite(conservativeCost) &&
      conservativeCost <= authorizedCap &&
      evidence?.costGuard?.capExceeded === false &&
      evidence?.costGuard?.deletedBeforeDeadline === true,
    cleanupComplete:
      evidence?.cleanup?.complete === true &&
      evidence?.cleanup?.temporaryCloudRunJobCreated === false &&
      evidence?.cleanup?.localPortOpened === false
  };

  const candidateCheckNames = [
    "rehearsalSucceeded",
    "sourceIdentityExact",
    "candidateManifestExact",
    "exactArtifactProvenance",
    "restoreWasIsolated",
    "migrationFirstPassSucceeded",
    "migrationRerunIdempotent",
    "reconciliationPassed",
    "noEvidenceBlockers"
  ];
  const cleanupCheckNames = [
    "productionSourceProtected",
    "restoreTargetDeleted",
    "cloudRunJobRestored",
    "costWithinAuthorization",
    "cleanupComplete"
  ];
  const candidateMatches = candidateCheckNames.every((name) => checks[name] === true);
  const cleanupVerified = cleanupCheckNames.every((name) => checks[name] === true);

  return {
    checks,
    candidateMatches,
    cleanupVerified,
    matchesCandidate: candidateMatches && cleanupVerified
  };
}
