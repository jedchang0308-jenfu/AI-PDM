"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Download, FileCheck2, FileDown, Printer, RefreshCcw, ShieldAlert } from "lucide-react";
import { LifecycleStageGuidance } from "@/components/lifecycle-ux";
import { NextStepState } from "@/components/next-step-state";
import { SearchHighlight } from "@/components/search-highlight";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { WorkflowStrip } from "@/components/workflow-strip";
import { formatStatusErrorForUser } from "@/lib/status-display";

type HandoffEntry = {
  id: string;
  drawing_number: string;
  revision: string;
  part_number: string;
  part_name: string;
  material: string;
  surface_finish: string;
  document_type: string;
  change_description: string;
  released_at: string | null;
  submitted_by_name: string;
  package: {
    filename: string;
    sha256: string;
    file_size: number;
    created_at: string;
    download_url: string;
  } | null;
  files: Array<{
    role: string;
    filename: string;
    sha256: string;
    size: number;
  }>;
  approvals: Array<{
    reviewer_name: string;
    decision: string;
    decided_at: string;
  }>;
};

type PageState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ready"; generatedAt: string; entries: HandoffEntry[] };

export default function ManufacturingHandoffPage() {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [query, setQuery] = useState("");

  const load = () => {
    setState({ status: "loading" });
    fetch("/api/handoff")
      .then(async (response) => {
        if (response.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setState({ status: "error", message: formatStatusErrorForUser(body.error ?? "讀取製造交接資料失敗", "submission") });
          return;
        }
        setState({ status: "ready", generatedAt: body.generatedAt, entries: body.entries ?? [] });
      })
      .catch((error) => setState({ status: "error", message: formatStatusErrorForUser(error instanceof Error ? error.message : error, "submission") }));
  };

  useEffect(() => {
    load();
  }, []);

  const filteredEntries = useMemo(() => {
    if (state.status !== "ready") return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return state.entries;
    return state.entries.filter((entry) =>
      [entry.drawing_number, entry.revision, entry.part_number, entry.part_name, entry.material, entry.surface_finish, entry.change_description]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query, state]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>製造交接 <StatusScopeHelp scope="handoffWorkbench" /></h1>
          <p>每個料號只顯示最新已發布版本，集中發布包、檔案雜湊、核准者與發布時間。</p>
        </div>
        <div className="actions">
          <Link className="secondary-button" href="/">
            回工作台
          </Link>
          <a className="secondary-button" href="/api/handoff/export">
            <FileDown size={16} aria-hidden="true" />
            匯出 CSV
          </a>
          <button className="secondary-button" type="button" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" />
            列印
          </button>
          <button className="secondary-button" type="button" onClick={load} disabled={state.status === "loading"}>
            <RefreshCcw size={16} aria-hidden="true" />
            重新整理
          </button>
        </div>
      </div>

      <WorkflowStrip
        title="交接流程"
        description="只取已發布圖料與交接包，讓製造、採購與外部協作使用一致版本。"
        steps={["已發布", "交接包", "製造取用", "報表", "稽核"]}
        currentStep="交接包"
        actions={[
          { href: "/numbering/reports", label: "看報表", variant: "primary" },
          { href: "/numbering/search", label: "查圖料" }
        ]}
      />

      <LifecycleStageGuidance
        activeStage="handoff"
        metrics={[
          { label: "已發布資料", value: state.status === "ready" ? state.entries.length : "-" },
          {
            label: "缺交接包",
            value: state.status === "ready" ? state.entries.filter((entry) => !entry.package).length : "-",
            tone: state.status === "ready" && state.entries.some((entry) => !entry.package) ? "warning" : "success"
          },
          { label: "目前顯示", value: state.status === "ready" ? filteredEntries.length : "-" }
        ]}
      />

      {state.status === "loading" ? (
        <section className="panel">
          <div className="empty">讀取製造交接資料...</div>
        </section>
      ) : null}

      {state.status === "unauthorized" ? (
        <section className="panel">
          <div className="empty">
            <ShieldAlert size={22} aria-hidden="true" />
            <h2>尚未登入</h2>
            <p>請先登入 AI PDM，再查看製造交接資料。</p>
            <div className="empty-actions">
              <Link className="primary-button" href="/login">
                登入
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {state.status === "error" ? (
        <section className="panel">
          <NextStepState
            eyebrow="重新嘗試"
            title="製造交接資料暫時無法讀取"
            body={`${state.message} 現在請重新整理；若仍失敗，請回圖料模組確認已發布資料，或請 Admin 協助檢查交接資料。`}
            actions={[
              { href: "/handoff", label: "重新整理", variant: "primary" },
              { href: "/numbering/search", label: "回圖料模組" }
            ]}
          />
        </section>
      ) : null}

      {state.status === "ready" ? (
        <>
          <section className="handoff-summary" aria-label="manufacturing handoff summary">
            <div>
              <span>最新已發布料號</span>
              <strong>{state.entries.length}</strong>
            </div>
            <div>
              <span>發布包完整率</span>
              <strong>{packageRate(state.entries)}%</strong>
            </div>
            <div>
              <span>產生時間</span>
              <strong>{new Date(state.generatedAt).toLocaleString()}</strong>
            </div>
          </section>

          <section className="search-bar" aria-label="handoff search">
            <FileCheck2 size={18} aria-hidden="true" />
            <input value={query} placeholder="搜尋圖號、料號、品名、材質、變更原因" onChange={(event) => setQuery(event.target.value)} />
            {query ? (
              <button className="secondary-button" type="button" onClick={() => setQuery("")}>
                清除
              </button>
            ) : null}
          </section>

          <section className="handoff-list" aria-label="released handoff entries">
            {filteredEntries.length === 0 ? (
              <div className="panel">
                <NextStepState
                  eyebrow="沒有交接資料"
                  title={query ? "目前沒有符合條件的已發布交接資料" : "目前沒有可交接的已發布資料"}
                  body={query ? "請調整搜尋條件，或回圖料模組確認圖號、料號與發行狀態。" : "完成圖號審核與 BOM 發行後，交接包會出現在這裡供製造端下載。"}
                  actions={[
                    { href: "/numbering/search", label: "回圖料模組", variant: "primary" },
                    { href: "/numbering/reports", label: "看報表" }
                  ]}
                />
              </div>
            ) : (
              filteredEntries.map((entry) => <HandoffCard entry={entry} query={query} key={entry.id} />)
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function HandoffCard({ entry, query }: { entry: HandoffEntry; query: string }) {
  return (
    <article className="panel handoff-card">
      <div className="handoff-card-header">
        <div>
          <span className="section-label">圖號</span>
          <h2>
            <span className="identity-primary"><SearchHighlight value={entry.drawing_number} query={query} /></span>
            <span className="metadata-badge">版次 <SearchHighlight value={entry.revision} query={query} /></span>
          </h2>
          <div className="metadata-list">
            <span className="metadata-pair">
              <span className="metadata-label">料號</span>
              <span className="metadata-value"><SearchHighlight value={entry.part_number} query={query} /></span>
            </span>
            <span className="metadata-pair">
              <span className="metadata-label">品名</span>
              <span className="metadata-value"><SearchHighlight value={entry.part_name} query={query} /></span>
            </span>
          </div>
        </div>
        {entry.package ? (
          <a className="primary-button" href={entry.package.download_url}>
            <Download size={16} aria-hidden="true" />
            下載發布包
          </a>
        ) : (
          <div className="handoff-missing-package">
            <span className="badge ReleaseFailed">缺發布包</span>
            <p>製造端現在不可取用。請 PDM 或 R&D Manager 回送審明細補齊發布包。</p>
            <Link className="secondary-button" href={`/submissions/${encodeURIComponent(entry.id)}`}>
              查看送審
            </Link>
          </div>
        )}
      </div>

      <div className="handoff-grid">
        <Info label="發布時間" value={entry.released_at ? new Date(entry.released_at).toLocaleString() : "-"} query={query} />
        <Info label="材質" value={entry.material} query={query} />
        <Info label="表面處理" value={entry.surface_finish} query={query} />
        <Info label="文件類型" value={entry.document_type} query={query} />
      </div>

      <div className="handoff-note">
        <span className="section-label">變更原因</span>
        <p><SearchHighlight value={entry.change_description} query={query} /></p>
      </div>

      {entry.package ? (
        <div className="handoff-package">
          <Archive size={16} aria-hidden="true" />
          <div>
            <strong className="file-title">
              <span className="file-kind-badge" aria-label="檔案格式 ZIP">
                ZIP
              </span>
              <span className="file-name"><SearchHighlight value={entry.package.filename} query={query} /></span>
            </strong>
            <div className="metadata-list">
              <span className="metadata-pair">
                <span className="metadata-label">大小</span>
                <span className="metadata-value">{(entry.package.file_size / 1024).toFixed(1)} KB</span>
              </span>
            </div>
            <details className="integrity-details">
              <summary>完整性資訊</summary>
              <span className="diagnostic-value">SHA256 {entry.package.sha256}</span>
            </details>
          </div>
        </div>
      ) : null}

      <div className="handoff-columns">
        <div>
          <span className="section-label">檔案</span>
          <div className="handoff-file-list">
            {entry.files.map((file) => (
              <div className="handoff-file" key={`${entry.id}-${file.role}-${file.filename}`}>
                <strong className="file-title">
                  <span className="file-kind-badge" aria-label={`檔案格式 ${file.role.toUpperCase()}`}>
                    {file.role.toUpperCase()}
                  </span>
                  <span className="file-name"><SearchHighlight value={file.filename} query={query} /></span>
                </strong>
                <div className="metadata-list">
                  <span className="metadata-pair">
                    <span className="metadata-label">大小</span>
                    <span className="metadata-value">{(file.size / 1024).toFixed(1)} KB</span>
                  </span>
                </div>
                <details className="integrity-details">
                  <summary>完整性資訊</summary>
                  <span className="diagnostic-value">SHA256 {file.sha256}</span>
                </details>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="section-label">核准紀錄</span>
          <div className="handoff-file-list">
            {entry.approvals.map((approval) => (
              <div className="handoff-file" key={`${entry.id}-${approval.reviewer_name}-${approval.decided_at}`}>
                <strong><SearchHighlight value={approval.reviewer_name} query={query} /></strong>
                <div className="metadata-list">
                  <span className="metadata-badge"><SearchHighlight value={approval.decision} query={query} /></span>
                  <span className="metadata-pair">
                    <span className="metadata-label">時間</span>
                    <span className="metadata-value">{new Date(approval.decided_at).toLocaleString()}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function Info({ label, value, query }: { label: string; value: string; query?: string }) {
  return (
    <div className="handoff-info">
      <span>{label}</span>
      <strong><SearchHighlight value={value} query={query} /></strong>
    </div>
  );
}

function packageRate(entries: HandoffEntry[]) {
  if (entries.length === 0) return 100;
  const ready = entries.filter((entry) => entry.package).length;
  return Math.round((ready / entries.length) * 100);
}
