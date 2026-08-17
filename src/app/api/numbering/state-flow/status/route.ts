import { NextResponse } from "next/server";
import {
  numberLifecycleV2ClientStatus,
  numberStateFlowV1ClientStatus,
  unifiedDrawingWorkbenchV1ClientStatus,
  unifiedPartRelationWorkbenchV1ClientStatus,
  workbenchPreviewGalleryClientStatus,
  pdmEntityDetailClientStatus,
  drawingRecognitionClientStatus
} from "@/lib/number-state-flow-feature";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ...numberStateFlowV1ClientStatus(),
    lifecycleV2: numberLifecycleV2ClientStatus(),
    drawingWorkbench: unifiedDrawingWorkbenchV1ClientStatus(),
    partRelationWorkbench: unifiedPartRelationWorkbenchV1ClientStatus(),
    previewGallery: workbenchPreviewGalleryClientStatus(),
    entityDetail: pdmEntityDetailClientStatus(),
    drawingRecognition: drawingRecognitionClientStatus()
  }, {
    headers: { "cache-control": "private, no-store" }
  });
}
