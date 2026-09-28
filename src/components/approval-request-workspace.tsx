"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, RefreshCcw } from "lucide-react";
import { CanonicalReviewPackageWorkspace,
  type CanonicalReviewPackageShell } from "@/components/canonical-review-package-workspace";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";

type ReviewResponse = {
  data?: CanonicalReviewPackageShell & { entityType?: string; schemaVersion?: string };
  meta?: { contractToken?: string };
  code?: string;
};

export function ApprovalRequestWorkspace({ requestId }: { requestId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = normalizePdmApprovalReturnTo(searchParams.get("returnTo"));
  const [shell, setShell] = useState<CanonicalReviewPackageShell | null>(null);
  const [contractToken, setContractToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/pdm/review-requests/${encodeURIComponent(requestId)}`,
        { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as ReviewResponse;
      if (!response.ok) {
        throw new Error(response.status === 404
          ? "找不到這筆可處理的審核。"
          : body.code === "auth_session_invalid" ? "請重新登入後再開啟審核。" : "審核明細目前無法載入。");
      }
      if (body.data?.schemaVersion !== "pdm-review-package-v2" ||
        !["drawing", "part"].includes(body.data.entityType ?? "")) {
        throw new Error("此審核尚未轉換為 Principal 審核包。");
      }
      setShell(body.data);
      setContractToken(body.meta?.contractToken ?? "");
    } catch (caught) {
      setShell(null);
      setError(caught instanceof Error ? caught.message : "審核明細目前無法載入。");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { void load(); }, [load]);

  if (shell) return <CanonicalReviewPackageWorkspace requestId={requestId}
    returnTo={returnTo} initialShell={shell} initialContractToken={contractToken} />;
  if (loading) return <main className="dev079-workspace-loading" role="status">
    <LoaderCircle className="spin" size={20} />正在載入審核工作區...
  </main>;
  return <main className="dev079-workspace-state">
    <h1>審核工作區</h1>
    <p role="alert">{error || "找不到這筆審核。"}</p>
    <button className="secondary-button" type="button" onClick={() => router.push(returnTo)}>
      <ArrowLeft size={16} />返回審核清單
    </button>
    <button className="secondary-button" type="button" onClick={() => void load()}>
      <RefreshCcw size={16} />重新載入
    </button>
  </main>;
}
