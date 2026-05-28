"use client";

import { useEffect, useState } from "react";
import { Archive, Download, FileText, Send } from "lucide-react";

type PublicShareData = {
  share: {
    id: string;
    label: string;
    expires_at: string;
    created_at: string;
  };
  submission: {
    id: string;
    drawing_number: string;
    revision: string;
    part_number: string;
    part_name: string;
    material: string;
    surface_finish: string;
    document_type: string;
    change_description: string;
    status: string;
    released_at: string | null;
    submitted_by_name: string;
  };
  package: {
    filename: string;
    sha256: string;
    file_size: number;
    created_at: string;
    download_url: string;
  } | null;
  files: Array<{
    id: string;
    role: string;
    filename: string;
    sha256: string;
    size: number;
  }>;
  bom: {
    parent_revision: string;
    status: string;
    line_count: number;
    lines: Array<{
      line_no: number;
      child_part_number: string;
      child_revision: string | null;
      quantity: number;
      source_filename: string | null;
    }>;
  } | null;
  approvals: Array<{
    reviewer_name: string;
    decision: string;
    decided_at: string;
  }>;
  supplier_responses: Array<{
    id: string;
    response_kind: "acknowledgement" | "question";
    supplier_name: string;
    supplier_email: string;
    message: string;
    status: "open" | "closed";
    created_at: string;
    closed_at: string | null;
  }>;
};

function formatPublicStatus(value: string) {
  const labels: Record<string, string> = {
    open: "未結案",
    closed: "已結案"
  };
  return labels[value] ?? value;
}

export default function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [data, setData] = useState<PublicShareData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [responseKind, setResponseKind] = useState<"acknowledgement" | "question">("acknowledgement");
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierMessage, setSupplierMessage] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [responseLoading, setResponseLoading] = useState(false);

  useEffect(() => {
    params.then(({ token: nextToken }) => setToken(nextToken)).catch(() => setStatus("error"));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/shares/${token}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("找不到分享連結");
        return response.json();
      })
      .then((body) => {
        setData(body);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  async function submitSupplierResponse() {
    if (!token || !supplierName.trim() || !supplierEmail.trim() || !supplierMessage.trim()) return;
    setResponseLoading(true);
    setResponseMessage("");
    const response = await fetch(`/api/public/shares/${token}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        responseKind,
        supplierName: supplierName.trim(),
        supplierEmail: supplierEmail.trim(),
        message: supplierMessage.trim()
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setResponseMessage(body.error ?? "回覆失敗");
    } else {
      setData((current) =>
        current && body.response
          ? {
              ...current,
              supplier_responses: [body.response, ...current.supplier_responses]
            }
          : current
      );
      setSupplierMessage("");
      setResponseMessage("回覆已送出。");
    }
    setResponseLoading(false);
  }

  if (status === "loading") {
    return (
      <main className="public-share-page">
        <section className="public-share-hero">
          <span className="section-label">唯讀分享</span>
          <h1>正在載入發布包</h1>
        </section>
      </main>
    );
  }

  if (status === "error" || !data) {
    return (
      <main className="public-share-page">
        <section className="public-share-hero">
          <span className="section-label">唯讀分享</span>
          <h1>分享無法使用</h1>
          <p>此連結無效、已過期或已撤銷。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-share-page">
      <section className="public-share-hero">
        <span className="section-label">唯讀分享</span>
        <h1>
          {data.submission.drawing_number} 版次 {data.submission.revision}
        </h1>
        <p>
          {data.submission.part_number} · {data.submission.part_name}
        </p>
      </section>

      <section className="public-share-grid">
        <div className="panel public-share-panel">
          <span className="section-label">發布包</span>
          {data.package ? (
            <>
              <strong>
                <Archive size={16} aria-hidden="true" /> {data.package.filename}
              </strong>
              <small>
                ZIP · {(data.package.file_size / 1024).toFixed(1)} KB · SHA256 {data.package.sha256}
              </small>
              <a className="primary-button" href={data.package.download_url}>
                <Download size={16} aria-hidden="true" />
                下載
              </a>
            </>
          ) : (
            <small>目前沒有可用的發布包。</small>
          )}
        </div>

        <div className="panel public-share-panel">
          <span className="section-label">中繼資料</span>
          <Info label="文件" value={data.submission.document_type} />
          <Info label="材質" value={data.submission.material || "-"} />
          <Info label="表面處理" value={data.submission.surface_finish || "-"} />
          <Info label="發布時間" value={data.submission.released_at ?? "-"} />
          <Info label="建立者" value={data.submission.submitted_by_name} />
          <Info label="到期時間" value={data.share.expires_at} />
        </div>
      </section>

      <section className="panel public-share-panel">
        <span className="section-label">變更說明</span>
        <p>{data.submission.change_description}</p>
      </section>

      <section className="panel public-share-panel">
        <span className="section-label">供應商回覆</span>
        <div className="readonly-share-form">
          <label>
            類型
            <select className="dropdown-select" value={responseKind} onChange={(event) => setResponseKind(event.target.value as "acknowledgement" | "question")}>
              <option value="acknowledgement">確認</option>
              <option value="question">提問</option>
            </select>
          </label>
          <label>
            姓名
            <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} type="text" maxLength={80} />
          </label>
          <label>
            電子郵件
            <input value={supplierEmail} onChange={(event) => setSupplierEmail(event.target.value)} type="email" maxLength={120} />
          </label>
        </div>
        <label className="public-share-response-body">
          訊息
          <textarea value={supplierMessage} onChange={(event) => setSupplierMessage(event.target.value)} maxLength={1000} rows={4} />
        </label>
        <button
          className="primary-button"
          type="button"
          onClick={submitSupplierResponse}
          disabled={responseLoading || !supplierName.trim() || !supplierEmail.trim() || !supplierMessage.trim()}
        >
          <Send size={16} aria-hidden="true" />
          送出
        </button>
        {responseMessage ? <small>{responseMessage}</small> : null}
        {data.supplier_responses.length > 0 ? (
          <div className="public-share-list">
            {data.supplier_responses.map((response) => (
              <div className="public-share-list-item" key={response.id}>
                <strong>
                  {response.response_kind === "acknowledgement" ? "確認" : "提問"} / {response.supplier_name}
                </strong>
                <small>
                  {formatPublicStatus(response.status)} / {response.created_at}
                </small>
                <p>{response.message}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="public-share-columns">
        <div className="panel public-share-panel">
          <span className="section-label">檔案</span>
          <div className="public-share-list">
            {data.files.map((file) => (
              <div className="public-share-list-item" key={file.id}>
                <strong>
                  <FileText size={14} aria-hidden="true" /> {file.role.toUpperCase()} {file.filename}
                </strong>
                <small>
                  {(file.size / 1024).toFixed(1)} KB · SHA256 {file.sha256}
                </small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel public-share-panel">
          <span className="section-label">BOM</span>
          {data.bom ? (
            <div className="public-share-list">
              {data.bom.lines.map((line) => (
                <div className="public-share-list-item" key={`${line.line_no}-${line.child_part_number}`}>
                  <strong>
                    #{line.line_no} {line.child_part_number}
                  </strong>
                  <small>
                    版次 {line.child_revision ?? "-"} · 數量 {line.quantity} · {line.source_filename ?? "-"}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <small>目前沒有 BOM 快照。</small>
          )}
        </div>
      </section>

      <section className="panel public-share-panel">
        <span className="section-label">核准紀錄</span>
        <div className="public-share-list">
          {data.approvals.map((approval) => (
            <div className="public-share-list-item" key={`${approval.reviewer_name}-${approval.decided_at}`}>
              <strong>{approval.reviewer_name}</strong>
              <small>
                {approval.decision} · {approval.decided_at}
              </small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="public-share-info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
