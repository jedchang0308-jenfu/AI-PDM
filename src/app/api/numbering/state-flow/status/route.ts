import { NextResponse } from "next/server";
import {
  numberLifecycleV2ClientStatus,
  numberStateFlowV1ClientStatus,
  unifiedDrawingWorkbenchV1ClientStatus,
  unifiedPartRelationWorkbenchV1ClientStatus,
  workbenchPreviewGalleryClientStatus,
  partPreviewV1ClientStatus,
  pdmEntityDetailClientStatus,
  drawingRecognitionClientStatus,
  pdmWorkbenchProductionRdLanesV1ClientStatus
} from "@/lib/number-state-flow-feature";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ...numberStateFlowV1ClientStatus(),
    lifecycleV2: numberLifecycleV2ClientStatus(),
    drawingWorkbench: unifiedDrawingWorkbenchV1ClientStatus(),
    partRelationWorkbench: unifiedPartRelationWorkbenchV1ClientStatus(),
    previewGallery: workbenchPreviewGalleryClientStatus(),
    partPreview: partPreviewV1ClientStatus(),
    entityDetail: pdmEntityDetailClientStatus(),
    drawingRecognition: drawingRecognitionClientStatus(),
    productionRdLanes: pdmWorkbenchProductionRdLanesV1ClientStatus()
  }, {
    headers: { "cache-control": "private, no-store" }
  });
}
