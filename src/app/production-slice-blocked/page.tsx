import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { PRODUCTION_SLICE_UNOPENED_MESSAGE } from "@/lib/production-slice";

type BlockedPageProps = {
  searchParams?: Promise<{ from?: string }>;
};

export default async function ProductionSliceBlockedPage({ searchParams }: BlockedPageProps) {
  const params = await searchParams;
  const from = typeof params?.from === "string" ? params.from : "";

  return (
    <>
      <div className="topbar">
        <div>
          <h1>未開放</h1>
          <p>目前只開放編號建立與編號申請。</p>
        </div>
      </div>

      <section className="panel">
        <div className="empty">
          <LockKeyhole size={26} aria-hidden="true" />
          <strong>此功能尚未納入本次開放</strong>
          <p>{PRODUCTION_SLICE_UNOPENED_MESSAGE} 請改從編號搜尋建立編號，或到各工作台的編號申請分頁查看申請。</p>
          {from ? <p className="muted-text">來源路徑：{from}</p> : null}
          <div className="next-step-actions">
            <Link className="primary-button" href="/numbering/search?tab=reserved">
              建立編號
            </Link>
            <Link className="secondary-button" href="/parts?tab=drafts">
              查看編號申請
            </Link>
            <Link className="secondary-button" href="/numbering/search">
              查圖料
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
