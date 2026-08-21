import { Suspense } from "react";
import { DrawingOwnerWorkspace } from "@/components/drawing-owner-workspace";
import { CanonicalChangeWorkspace } from "@/components/canonical-change-workspace";

export const dynamic = "force-dynamic";

export default async function DrawingOwnerWorkspacePage({ params, searchParams }: { params: Promise<{ drawingId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { drawingId } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : null;
  const workId = value("workId");
  if (workId) return <CanonicalChangeWorkspace entityType="drawing" entityId={decodeURIComponent(drawingId)} workId={workId} returnTo={value("returnTo")} />;
  return (
    <Suspense fallback={<main className="dev079-workspace-loading" role="status">正在載入圖號工作區...</main>}>
      <DrawingOwnerWorkspace drawingId={decodeURIComponent(drawingId)} />
    </Suspense>
  );
}
