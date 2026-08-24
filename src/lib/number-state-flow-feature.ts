export const NUMBER_STATE_FLOW_V1_FLAG = "PDM_NUMBER_STATE_FLOW_V1";
export const NUMBER_LIFECYCLE_V2_FLAG = "PDM_NUMBER_LIFECYCLE_V2";
export const UNIFIED_DRAWING_WORKBENCH_V1_FLAG = "PDM_UNIFIED_DRAWING_WORKBENCH_V1";
export const UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG = "PDM_UNIFIED_PART_RELATION_WORKBENCH_V1";
export const WORKBENCH_PREVIEW_GALLERY_V1_FLAG = "PDM_WORKBENCH_PREVIEW_GALLERY_V1";
export const PART_PREVIEW_V1_FLAG = "PDM_PART_PREVIEW_V1";
export const DRAWING_REVISION_LIFECYCLE_MODE_FLAG = "PDM_DRAWING_REVISION_LIFECYCLE_MODE";
export const UNIFIED_ENTITY_DETAIL_V1_FLAG = "PDM_UNIFIED_ENTITY_DETAIL_V1";
export const DRAWING_RECOGNITION_V1_FLAG = "PDM_DRAWING_RECOGNITION_V1";
export const PDM_WORKBENCH_PRODUCTION_RD_LANES_V1_FLAG = "PDM_WORKBENCH_PRODUCTION_RD_LANES_V1";

type EnvLike = Record<string, string | undefined>;
export type DrawingRevisionLifecycleMode = "off" | "shadow" | "enforced";

export function isNumberStateFlowV1Enabled(env: EnvLike = process.env) {
  const value = String(env[NUMBER_STATE_FLOW_V1_FLAG] ?? "").trim().toLowerCase();
  if (!value) return true;
  return ["1", "true", "on", "enabled"].includes(value);
}

export function numberStateFlowV1ClientStatus(env: EnvLike = process.env) {
  return {
    enabled: isNumberStateFlowV1Enabled(env),
    flag: NUMBER_STATE_FLOW_V1_FLAG,
    phase: "1B"
  };
}

export function isNumberLifecycleV2Enabled(env: EnvLike = process.env) {
  const value = String(env[NUMBER_LIFECYCLE_V2_FLAG] ?? "").trim().toLowerCase();
  if (!value) return false;
  return ["1", "true", "on", "enabled"].includes(value);
}

export function numberLifecycleV2ClientStatus(env: EnvLike = process.env) {
  return {
    enabled: isNumberLifecycleV2Enabled(env),
    flag: NUMBER_LIFECYCLE_V2_FLAG,
    phase: "1D"
  };
}

export function isUnifiedDrawingWorkbenchV1Enabled(env: EnvLike = process.env) {
  const requested = ["1", "true", "on", "enabled"].includes(
    String(env[UNIFIED_DRAWING_WORKBENCH_V1_FLAG] ?? "").trim().toLowerCase()
  );
  return requested && isNumberLifecycleV2Enabled(env);
}

export function unifiedDrawingWorkbenchV1ClientStatus(env: EnvLike = process.env) {
  const requested = ["1", "true", "on", "enabled"].includes(
    String(env[UNIFIED_DRAWING_WORKBENCH_V1_FLAG] ?? "").trim().toLowerCase()
  );
  return {
    enabled: requested && isNumberLifecycleV2Enabled(env),
    requested,
    flag: UNIFIED_DRAWING_WORKBENCH_V1_FLAG,
    dependency: NUMBER_LIFECYCLE_V2_FLAG,
    phase: "DEV-053"
  };
}

export function isUnifiedPartRelationWorkbenchV1Enabled(env: EnvLike = process.env) {
  const requested = ["1", "true", "on", "enabled"].includes(
    String(env[UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG] ?? "").trim().toLowerCase()
  );
  return requested && isNumberStateFlowV1Enabled(env);
}

export function unifiedPartRelationWorkbenchV1ClientStatus(env: EnvLike = process.env) {
  const requested = ["1", "true", "on", "enabled"].includes(
    String(env[UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG] ?? "").trim().toLowerCase()
  );
  return {
    enabled: requested && isNumberStateFlowV1Enabled(env),
    requested,
    flag: UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG,
    dependency: NUMBER_STATE_FLOW_V1_FLAG,
    phase: "DEV-062"
  };
}

function isTruthyFlag(value: string | undefined) {
  return ["1", "true", "on", "enabled"].includes(String(value ?? "").trim().toLowerCase());
}

export function isDrawingWorkbenchPreviewGalleryV1Enabled(env: EnvLike = process.env) {
  return isTruthyFlag(env[WORKBENCH_PREVIEW_GALLERY_V1_FLAG]) && isUnifiedDrawingWorkbenchV1Enabled(env);
}

export function isPartWorkbenchPreviewGalleryV1Enabled(env: EnvLike = process.env) {
  return isTruthyFlag(env[PART_PREVIEW_V1_FLAG])
    && isTruthyFlag(env[WORKBENCH_PREVIEW_GALLERY_V1_FLAG])
    && isUnifiedPartRelationWorkbenchV1Enabled(env);
}

export function partPreviewV1ClientStatus(env: EnvLike = process.env) {
  const requested = isTruthyFlag(env[PART_PREVIEW_V1_FLAG]);
  return {
    requested,
    enabled: requested && isPartWorkbenchPreviewGalleryV1Enabled(env),
    flag: PART_PREVIEW_V1_FLAG,
    dependencies: [WORKBENCH_PREVIEW_GALLERY_V1_FLAG, UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG],
    phase: "DEV-065-P2"
  };
}

export function isPdmWorkbenchProductionRdLanesV1Enabled(env: EnvLike = process.env) {
  return isTruthyFlag(env[PDM_WORKBENCH_PRODUCTION_RD_LANES_V1_FLAG])
    && isUnifiedDrawingWorkbenchV1Enabled(env)
    && isUnifiedPartRelationWorkbenchV1Enabled(env);
}

export function pdmWorkbenchProductionRdLanesV1ClientStatus(env: EnvLike = process.env) {
  const requested = isTruthyFlag(env[PDM_WORKBENCH_PRODUCTION_RD_LANES_V1_FLAG]);
  return {
    requested,
    enabled: isPdmWorkbenchProductionRdLanesV1Enabled(env),
    flag: PDM_WORKBENCH_PRODUCTION_RD_LANES_V1_FLAG,
    dependencies: [UNIFIED_DRAWING_WORKBENCH_V1_FLAG, UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG],
    phase: "DEV-086"
  };
}

export function isPdmEntityDetailV1Enabled(env: EnvLike = process.env) {
  return isTruthyFlag(env[UNIFIED_ENTITY_DETAIL_V1_FLAG])
    && isUnifiedDrawingWorkbenchV1Enabled(env)
    && isUnifiedPartRelationWorkbenchV1Enabled(env);
}

export function pdmEntityDetailClientStatus(env: EnvLike = process.env) {
  const requested = isTruthyFlag(env[UNIFIED_ENTITY_DETAIL_V1_FLAG]);
  return {
    requested,
    enabled: isPdmEntityDetailV1Enabled(env),
    flag: UNIFIED_ENTITY_DETAIL_V1_FLAG,
    dependencies: [UNIFIED_DRAWING_WORKBENCH_V1_FLAG, UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG],
    phase: "DEV-067"
  };
}

export function isDrawingRecognitionV1Enabled(env: EnvLike = process.env) {
  return isTruthyFlag(env[DRAWING_RECOGNITION_V1_FLAG]) && isUnifiedDrawingWorkbenchV1Enabled(env);
}

export function drawingRecognitionClientStatus(env: EnvLike = process.env) {
  const requested = isTruthyFlag(env[DRAWING_RECOGNITION_V1_FLAG]);
  return {
    requested,
    enabled: requested && isUnifiedDrawingWorkbenchV1Enabled(env),
    flag: DRAWING_RECOGNITION_V1_FLAG,
    dependency: UNIFIED_DRAWING_WORKBENCH_V1_FLAG,
    phase: "DEV-068"
  };
}

export function workbenchPreviewGalleryClientStatus(env: EnvLike = process.env) {
  const requested = isTruthyFlag(env[WORKBENCH_PREVIEW_GALLERY_V1_FLAG]);
  return {
    requested,
    flag: WORKBENCH_PREVIEW_GALLERY_V1_FLAG,
    drawingEnabled: requested && isUnifiedDrawingWorkbenchV1Enabled(env),
    partEnabled: requested && isUnifiedPartRelationWorkbenchV1Enabled(env),
    dependencies: [UNIFIED_DRAWING_WORKBENCH_V1_FLAG, UNIFIED_PART_RELATION_WORKBENCH_V1_FLAG],
    phase: "DEV-065"
  };
}

export function drawingRevisionLifecycleMode(env: EnvLike = process.env): DrawingRevisionLifecycleMode {
  const value = String(env[DRAWING_REVISION_LIFECYCLE_MODE_FLAG] ?? "").trim().toLowerCase();
  if (value === "shadow" || value === "enforced") return value;
  return "off";
}

export function drawingRevisionLifecycleModeStatus(env: EnvLike = process.env) {
  const requested = String(env[DRAWING_REVISION_LIFECYCLE_MODE_FLAG] ?? "").trim().toLowerCase();
  return {
    mode: drawingRevisionLifecycleMode(env),
    requested: requested || "off",
    valid: !requested || ["off", "shadow", "enforced"].includes(requested),
    flag: DRAWING_REVISION_LIFECYCLE_MODE_FLAG,
    phase: "DEV-053-1H"
  };
}
