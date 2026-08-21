import { Suspense } from "react";
import { ApprovalRequestWorkspace } from "@/components/approval-request-workspace";

export const dynamic = "force-dynamic";

export default async function ApprovalRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return (
    <Suspense fallback={<main className="dev079-workspace-loading" role="status">正在載入審核工作區...</main>}>
      <ApprovalRequestWorkspace requestId={decodeURIComponent(requestId)} />
    </Suspense>
  );
}
