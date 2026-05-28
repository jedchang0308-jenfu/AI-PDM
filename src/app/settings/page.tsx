"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Save, ShieldAlert } from "lucide-react";

type SettingsState =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "unauthorized" }
  | { status: "ready"; settings: Record<string, boolean | string> }
  | { status: "error"; message: string };

export default function SettingsPage() {
  const [state, setState] = useState<SettingsState>({ status: "loading" });

  const fetchSettings = () => {
    fetch("/api/settings")
      .then(async (response) => {
        if (response.status === 401) {
          setState({ status: "unauthorized" });
          return;
        }
        if (response.status === 403) {
          setState({ status: "forbidden" });
          return;
        }
        const body = await response.json();
        if (!response.ok) {
          setState({ status: "error", message: body.error ?? "設定讀取失敗" });
          return;
        }
        setState({ status: "ready", settings: body.settings ?? {} });
      })
      .catch((error) => setState({ status: "error", message: error instanceof Error ? error.message : "未知錯誤" }));
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>系統設定</h1>
          <p>僅系統管理員可以查看與調整系統設定。</p>
        </div>
      </div>

      {state.status === "loading" ? (
        <section className="panel">
          <div className="empty">正在載入設定...</div>
        </section>
      ) : null}
      {state.status === "unauthorized" ? <AccessPanel title="需要登入" message="請先登入後再查看系統設定。" /> : null}
      {state.status === "forbidden" ? <AccessPanel title="需要系統管理員權限" message="只有系統管理員可以管理系統設定。" /> : null}
      {state.status === "error" ? <AccessPanel title="無法讀取設定" message={state.message} /> : null}
      {state.status === "ready" ? <SettingsPanel settings={state.settings} onSaved={fetchSettings} /> : null}
    </>
  );
}

function AccessPanel({ title, message }: { title: string; message: string }) {
  const showLoginLink = title === "需要登入";

  return (
    <section className="panel">
      <div className="empty">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{message}</p>
        {showLoginLink ? (
          <div className="empty-actions">
            <Link className="primary-button" href="/login">
              前往登入
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SettingsPanel({ settings, onSaved }: { settings: Record<string, boolean | string>; onSaved: () => void }) {
  const [pendingFolder, setPendingFolder] = useState(String(settings.gdrive_pending_folder_id ?? ""));
  const [releasedFolder, setReleasedFolder] = useState(String(settings.gdrive_released_folder_id ?? ""));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gdrive_pending_folder_id: pendingFolder,
        gdrive_released_folder_id: releasedFolder
      })
    });
    const body = await res.json().catch(() => ({}));

    setLoading(false);
    if (!res.ok) {
      setMessage({ type: "error", text: body.error ?? "儲存失敗" });
      return;
    }

    setMessage({ type: "success", text: "設定已儲存" });
    onSaved();
  }

  const readonlySettings = Object.entries(settings).filter(
    ([key]) => key !== "gdrive_pending_folder_id" && key !== "gdrive_released_folder_id"
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <section className="panel">
        <div className="panel-header">
          <h2>Google Drive 設定</h2>
        </div>
        <form onSubmit={submit} style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontSize: "0.85rem", opacity: 0.8, margin: 0 }}>
            請填入 Google Drive 資料夾 ID。待審核資料夾用於暫存送審檔案，已發布資料夾用於正式發布檔案。
            <br />
            注意：這些資料夾必須共用給系統服務帳號電子郵件，系統才有權限上傳或搬移檔案。
          </p>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.9rem" }}>
            待審核資料夾 ID（送審暫存區）
            <input
              value={pendingFolder}
              onChange={(e) => setPendingFolder(e.target.value)}
              placeholder="例如：1A2b3C4d5E6f7G8h9I0j"
              style={{ padding: "0.5rem", border: "1px solid var(--line)", borderRadius: "4px" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.9rem" }}>
            已發布資料夾 ID（正式發布區）
            <input
              value={releasedFolder}
              onChange={(e) => setReleasedFolder(e.target.value)}
              placeholder="例如：0J9i8H7g6F5e4D3c2B1a"
              style={{ padding: "0.5rem", border: "1px solid var(--line)", borderRadius: "4px" }}
            />
          </label>

          {message ? (
            <div
              style={{
                color: message.type === "error" ? "var(--danger)" : "var(--success)",
                fontSize: "0.9rem",
                padding: "0.5rem",
                backgroundColor: message.type === "error" ? "#feecec" : "#e8f7ef",
                borderRadius: "4px"
              }}
            >
              {message.text}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="primary-button" type="submit" disabled={loading}>
              <Save size={16} />
              {loading ? "儲存中..." : "儲存設定"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>環境設定（唯讀）</h2>
        </div>
        <div className="detail">
          {readonlySettings.map(([key, value]) => (
            <div className="detail-row" key={key}>
              <span>{key}</span>
              <strong>{formatSettingValue(value)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatSettingValue(value: boolean | string) {
  if (typeof value === "boolean") return value ? "已設定" : "未設定";
  return value || "未設定";
}
