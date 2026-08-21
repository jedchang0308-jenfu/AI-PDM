import { Suspense } from "react";
import { DrawingOwnerWorkspace } from "@/components/drawing-owner-workspace";

export const dynamic = "force-dynamic";

export default async function DrawingOwnerWorkspacePage({ params }: { params: Promise<{ drawingId: string }> }) {
  const { drawingId } = await params;
  return (
    <Suspense fallback={<main className="dev079-workspace-loading" role="status">正在載入圖號工作區...</main>}>
      <DrawingOwnerWorkspace drawingId={decodeURIComponent(drawingId)} />
    </Suspense>
  );
}
