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
          <p>目前只開放正式領號與料號草稿。</p>
        </div>
      </div>

      <section className="panel">
        <div className="empty">
          <LockKeyhole size={26} aria-hidden="true" />
          <strong>此功能尚未納入本次開放</strong>
          <p>{PRODUCTION_SLICE_UNOPENED_MESSAGE} 請先使用領號申請、圖料查詢、圖號模組、料號模組或料號草稿。</p>
          {from ? <p className="muted-text">來源路徑：{from}</p> : null}
          <div className="next-step-actions">
            <Link className="primary-button" href="/numbering/request">
              前往領號申請
            </Link>
            <Link className="secondary-button" href="/numbering/part-drafts">
              前往料號草稿
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
