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
          <p>目前只開放正式領號與保留號。</p>
        </div>
      </div>

      <section className="panel">
        <div className="empty">
          <LockKeyhole size={26} aria-hidden="true" />
          <strong>此功能尚未納入本次開放</strong>
          <p>{PRODUCTION_SLICE_UNOPENED_MESSAGE} 請改從圖料模組建立保留號，或到各模組的保留號分頁查看申請。</p>
          {from ? <p className="muted-text">來源路徑：{from}</p> : null}
          <div className="next-step-actions">
            <Link className="primary-button" href="/numbering/search?tab=reserved">
              建立保留號
            </Link>
            <Link className="secondary-button" href="/parts?tab=drafts">
              查看保留號
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
