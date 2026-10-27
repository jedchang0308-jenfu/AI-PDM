"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, Download, MonitorCog, RefreshCw, ShieldOff } from "lucide-react";

type Device = {
  id: string;
  name: string;
  serviceVersion: string;
  status: "active" | "revoked";
  connection: "online" | "offline" | "revoked";
  capabilities: Array<{ code: string; status: "ready" | "blocked" | "degraded"; readerVersion: string | null }>;
  lastSeenAt: string | null;
  rowVersion: number;
};

type Enrollment = { id: string; code: string; expiresAt: string };
type PageState = "loading" | "ready" | "forbidden" | "error";
const capabilityLabels: Record<string, string> = {
  solidworks_3d_preview_png: "3D 預覽",
  solidworks_2d_preview_png: "2D 預覽",
  solidworks_document_manager: "原生屬性"
};

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatTime(value: string | null) {
  if (!value) return "尚未連線";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false });
}

function errorMessage(body: { error?: string; code?: string } | null, fallback: string) {
  const code = body?.error ?? body?.code;
  const known: Record<string, string> = {
    INSTALLER_UNAVAILABLE: "目前版本的安裝程式尚未就緒。",
    ROLE_POLICY_MANAGER_REQUIRED: "只有直接指派的 PDM 系統管理員可以管理解析電腦。",
    WINDOWS_SERVICE_VERSION_CONFLICT: "電腦狀態已更新，請重新整理後再試。"
  };
  return code ? known[code] ?? `${fallback}（${code}）` : fallback;
}

export function WindowsServiceSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [copied, setCopied] = useState<"code" | "id" | null>(null);

  const loadDevices = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/settings/windows-service/devices", { cache: "no-store" });
      const body = await response.json().catch(() => null) as { devices?: Device[]; error?: string; code?: string } | null;
      if (response.status === 401 || response.status === 403) { setState("forbidden"); return; }
      if (!response.ok || !Array.isArray(body?.devices)) throw new Error(errorMessage(body, "解析電腦清單讀取失敗。"));
      setDevices(body.devices);
      setState("ready");
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "解析電腦清單讀取失敗。" });
      setState("error");
    }
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  async function createEnrollment() {
    setBusy(true);
    setMessage(null);
    setEnrollment(null);
    try {
      const random = crypto.getRandomValues(new Uint8Array(32));
      const code = toBase64Url(random);
      const requestId = crypto.randomUUID();
      const response = await fetch("/api/settings/windows-service/enrollments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, codeHash: await sha256(code) })
      });
      const body = await response.json().catch(() => null) as { id?: string; expiresAt?: string; error?: string; code?: string } | null;
      if (!response.ok || !body?.id || !body.expiresAt) throw new Error(errorMessage(body, "註冊碼建立失敗。"));
      setEnrollment({ id: body.id, code, expiresAt: body.expiresAt });
      setMessage({ type: "success", text: "單次註冊碼已建立；關閉或重整後不會再次顯示。" });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "註冊碼建立失敗。" });
    } finally { setBusy(false); }
  }

  async function revoke(device: Device) {
    if (!window.confirm(`確定停用「${device.name}」？停用後必須重新註冊才能使用。`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/settings/windows-service/devices/${encodeURIComponent(device.id)}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRowVersion: device.rowVersion })
      });
      const body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
      if (!response.ok) throw new Error(errorMessage(body, "停用解析電腦失敗。"));
      setMessage({ type: "success", text: `已停用「${device.name}」。` });
      await loadDevices();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "停用解析電腦失敗。" });
    } finally { setBusy(false); }
  }

  async function copy(value: string, kind: "code" | "id") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="windows-service-page">
      <header className="page-header windows-service-heading">
        <div>
          <h1>Windows 解析服務</h1>
          <p>下載一次安裝、建立十分鐘註冊碼，並查看公司內可解析 SolidWorks 檔案的電腦。</p>
        </div>
        <a className="primary-button" href="/api/settings/windows-service/installer">
          <Download size={17} aria-hidden="true" />下載安裝程式
        </a>
      </header>

      {state === "forbidden" ? <section className="panel" role="alert">你沒有管理 Windows 解析服務的權限。</section> : null}
      {message ? <div className={`windows-service-message is-${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</div> : null}

      {state !== "forbidden" ? <>
        <section className="panel windows-service-enrollment-panel">
          <div>
            <h2>註冊電腦</h2>
            <p>安裝後，在本機「AI-PDM 解析服務設定」貼上註冊 ID 與單次註冊碼。</p>
          </div>
          <button className="secondary-button" type="button" disabled={busy} onClick={() => void createEnrollment()}>
            <MonitorCog size={17} aria-hidden="true" />建立註冊碼
          </button>
          {enrollment ? <div className="windows-service-enrollment" role="status">
            <label>註冊 ID<span><code>{enrollment.id}</code><button type="button" className="icon-button" aria-label="複製註冊 ID" onClick={() => void copy(enrollment.id, "id")}>{copied === "id" ? <Check size={16} /> : <Clipboard size={16} />}</button></span></label>
            <label>單次註冊碼<span><code>{enrollment.code}</code><button type="button" className="icon-button" aria-label="複製單次註冊碼" onClick={() => void copy(enrollment.code, "code")}>{copied === "code" ? <Check size={16} /> : <Clipboard size={16} />}</button></span></label>
            <small>有效至 {formatTime(enrollment.expiresAt)}。系統只保存雜湊，離開本頁後無法找回原碼。</small>
          </div> : null}
        </section>

        <section className="panel windows-service-device-panel">
          <div className="panel-header">
            <div><h2>已註冊電腦</h2><p>連線與可處理項目分開顯示；離線不會刪除既有預覽結果。</p></div>
            <button className="secondary-button" type="button" disabled={busy || state === "loading"} onClick={() => void loadDevices()}><RefreshCw size={16} aria-hidden="true" />重新整理</button>
          </div>
          <div className="table-wrap">
            <table className="windows-service-table">
              <thead><tr><th>電腦</th><th>版本</th><th>連線</th><th>可處理項目</th><th>最後連線</th><th><span className="sr-only">操作</span></th></tr></thead>
              <tbody>
                {state === "loading" ? <tr><td colSpan={6}>正在讀取...</td></tr> : null}
                {state === "error" ? <tr><td colSpan={6}>目前無法讀取清單。</td></tr> : null}
                {state === "ready" && devices.length === 0 ? <tr><td colSpan={6}>尚未註冊解析電腦。</td></tr> : null}
                {state === "ready" ? devices.map((device) => <tr key={device.id}>
                  <td><strong>{device.name}</strong><small>{device.id}</small></td>
                  <td>{device.serviceVersion}</td>
                  <td><span className={`windows-service-status is-${device.connection}`}>{device.connection === "online" ? "在線" : device.connection === "offline" ? "離線" : "已停用"}</span></td>
                  <td><div className="windows-service-capabilities">{device.capabilities.length ? device.capabilities.map((capability) => <span className={`is-${capability.status}`} key={capability.code}>{capabilityLabels[capability.code] ?? capability.code}</span>) : <span className="is-blocked">尚未就緒</span>}</div></td>
                  <td>{formatTime(device.lastSeenAt)}</td>
                  <td>{device.status === "active" ? <button className="danger-button" type="button" disabled={busy} onClick={() => void revoke(device)}><ShieldOff size={15} aria-hidden="true" />停用</button> : null}</td>
                </tr>) : null}
              </tbody>
            </table>
          </div>
        </section>
      </> : null}
    </div>
  );
}
