"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Download, FileCheck2, FileDown, Printer, RefreshCcw, ShieldAlert } from "lucide-react";

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
          setState({ status: "error", message: body.error ?? "讀取製造交接資料失敗" });
          return;
        }
        setState({ status: "ready", generatedAt: body.generatedAt, entries: body.entries ?? [] });
      })
      .catch((error) => setState({ status: "error", message: error instanceof Error ? error.message : "讀取製造交接資料失敗" }));
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
          <h1>製造交接</h1>
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
          <div className="empty">
            <h2>讀取失敗</h2>
            <p>{state.message}</p>
          </div>
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
                <div className="empty">目前沒有符合條件的已發布交接資料。</div>
              </div>
            ) : (
              filteredEntries.map((entry) => <HandoffCard entry={entry} key={entry.id} />)
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function HandoffCard({ entry }: { entry: HandoffEntry }) {
  return (
    <article className="panel handoff-card">
      <div className="handoff-card-header">
        <div>
          <span className="section-label">圖號 / 版次</span>
          <h2>
            {entry.drawing_number} 版次 {entry.revision}
          </h2>
          <p>
            {entry.part_number} · {entry.part_name}
          </p>
        </div>
        {entry.package ? (
          <a className="primary-button" href={entry.package.download_url}>
            <Download size={16} aria-hidden="true" />
            下載發布包
          </a>
        ) : (
          <span className="badge ReleaseFailed">缺發布包</span>
        )}
      </div>

      <div className="handoff-grid">
        <Info label="發布時間" value={entry.released_at ? new Date(entry.released_at).toLocaleString() : "-"} />
        <Info label="材質" value={entry.material} />
        <Info label="表面處理" value={entry.surface_finish} />
        <Info label="文件類型" value={entry.document_type} />
      </div>

      <div className="handoff-note">
        <span className="section-label">變更原因</span>
        <p>{entry.change_description}</p>
      </div>

      {entry.package ? (
        <div className="handoff-package">
          <Archive size={16} aria-hidden="true" />
          <div>
            <strong>{entry.package.filename}</strong>
            <small>
              {(entry.package.file_size / 1024).toFixed(1)} KB · SHA256 {entry.package.sha256}
            </small>
          </div>
        </div>
      ) : null}

      <div className="handoff-columns">
        <div>
          <span className="section-label">檔案與 hash</span>
          <div className="handoff-file-list">
            {entry.files.map((file) => (
              <div className="handoff-file" key={`${entry.id}-${file.role}-${file.filename}`}>
                <strong>
                  {file.role.toUpperCase()} {file.filename}
                </strong>
                <small>
                  {(file.size / 1024).toFixed(1)} KB · {file.sha256}
                </small>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="section-label">核准紀錄</span>
          <div className="handoff-file-list">
            {entry.approvals.map((approval) => (
              <div className="handoff-file" key={`${entry.id}-${approval.reviewer_name}-${approval.decided_at}`}>
                <strong>
                  {approval.reviewer_name} · {approval.decision}
                </strong>
                <small>{new Date(approval.decided_at).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="handoff-info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function packageRate(entries: HandoffEntry[]) {
  if (entries.length === 0) return 100;
  const ready = entries.filter((entry) => entry.package).length;
  return Math.round((ready / entries.length) * 100);
}
