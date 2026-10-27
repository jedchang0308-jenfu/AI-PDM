"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Link2, RefreshCw, ShieldOff } from "lucide-react";

type Device = {
  id: string;
  name: string;
  serviceVersion: string;
  status: "active" | "revoked";
  connection: "online" | "offline" | "revoked";
  capabilities: Array<{ code: string; status: "ready" | "blocked" | "degraded"; readerVersion: string | null }>;
  lastSeenAt: string | null;
  rowVersion: number;
  ownedByCurrentUser: boolean;
};

type Pairing = { port: number; state: string } | null;
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
    WINDOWS_SERVICE_VERSION_CONFLICT: "電腦狀態已更新，請重新整理後再試。",
    WINDOWS_SERVICE_DEVICE_FORBIDDEN: "你只能解除連結自己的電腦。"
  };
  return code ? known[code] ?? `${fallback}（${code}）` : fallback;
}

function pairingFromLocation(): { pairing: Pairing; invalid: boolean } {
  if (typeof window === "undefined") return { pairing: null, invalid: false };
  const query = new URLSearchParams(window.location.search);
  if (query.get("pair") !== "1") return { pairing: null, invalid: false };
  const port = Number(query.get("port"));
  const state = query.get("state") ?? "";
  const exact = [...query.keys()].every((key) => ["pair", "port", "state"].includes(key));
  if (!exact || !Number.isSafeInteger(port) || port < 49152 || port > 65535 ||
      !/^[A-Za-z0-9_-]{43}$/u.test(state)) return { pairing: null, invalid: true };
  return { pairing: { port, state }, invalid: false };
}

export function WindowsServiceSettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pairing, setPairing] = useState<Pairing>(null);
  const [pairingInvalid, setPairingInvalid] = useState(false);
  const [canManageAll, setCanManageAll] = useState(false);

  const loadDevices = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/settings/windows-service/devices", { cache: "no-store" });
      const body = await response.json().catch(() => null) as {
        devices?: Device[]; canManageAll?: boolean; error?: string; code?: string;
      } | null;
      if (response.status === 401 || response.status === 403) { setState("forbidden"); return; }
      if (!response.ok || !Array.isArray(body?.devices)) throw new Error(errorMessage(body, "解析電腦清單讀取失敗。"));
      setDevices(body.devices);
      setCanManageAll(body.canManageAll === true);
      setState("ready");
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "解析電腦清單讀取失敗。" });
      setState("error");
    }
  }, []);

  useEffect(() => {
    const result = pairingFromLocation();
    setPairing(result.pairing);
    setPairingInvalid(result.invalid);
    void loadDevices();
  }, [loadDevices]);

  async function linkComputer() {
    if (!pairing) return;
    setBusy(true);
    setMessage(null);
    try {
      const code = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const requestId = crypto.randomUUID();
      const response = await fetch("/api/settings/windows-service/enrollments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, codeHash: await sha256(code) })
      });
      const body = await response.json().catch(() => null) as {
        id?: string; expiresAt?: string; error?: string; code?: string;
      } | null;
      if (!response.ok || !body?.id || !body.expiresAt) {
        throw new Error(errorMessage(body, "無法建立安全連結。"));
      }
      const callback = new URL(`http://127.0.0.1:${pairing.port}/`);
      callback.searchParams.set("state", pairing.state);
      callback.searchParams.set("enrollmentId", body.id);
      callback.searchParams.set("code", code);
      window.location.assign(callback.toString());
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "無法連結這台電腦。" });
      setBusy(false);
    }
  }

  async function revoke(device: Device) {
    if (!window.confirm(`確定解除連結「${device.name}」？解除後這台電腦會立即停止取得工作。`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/settings/windows-service/devices/${encodeURIComponent(device.id)}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRowVersion: device.rowVersion })
      });
      const body = await response.json().catch(() => null) as { error?: string; code?: string } | null;
      if (!response.ok) throw new Error(errorMessage(body, "解除連結失敗。"));
      setMessage({ type: "success", text: `已解除連結「${device.name}」。` });
      await loadDevices();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "解除連結失敗。" });
    } finally { setBusy(false); }
  }

  return (
    <div className="windows-service-page">
      <header className="page-header windows-service-heading">
        <div>
          <h1>Windows 解析程式</h1>
          <p>每位使用者在自己的 Windows 電腦安裝；登入公司 Google 帳號後即可自行連結。</p>
        </div>
        {!pairing ? <a className="primary-button" href="/api/settings/windows-service/installer">
          <Download size={17} aria-hidden="true" />下載安裝程式
        </a> : null}
      </header>

      {state === "forbidden" ? <section className="panel" role="alert">你的 AI-PDM 帳號目前無法使用此功能。</section> : null}
      {message ? <div className={`windows-service-message is-${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</div> : null}

      {pairingInvalid ? <section className="panel" role="alert">
        <h2>連結請求無效</h2><p>請回到安裝視窗，按「重新開啟登入頁」。</p>
      </section> : null}

      {pairing ? <section className="panel windows-service-enrollment-panel">
        <div>
          <h2>連結這台電腦</h2>
          <p>確認後，系統會為這台電腦建立獨立、可撤銷且只屬於你目前帳號的裝置憑證。</p>
        </div>
        <button className="primary-button" type="button" disabled={busy || state !== "ready"} onClick={() => void linkComputer()}>
          <Link2 size={17} aria-hidden="true" />{busy ? "正在連結…" : "連結這台電腦"}
        </button>
      </section> : null}

      {!pairing && state !== "forbidden" ? <section className="panel windows-service-device-panel">
        <div className="panel-header">
          <div><h2>{canManageAll ? "已連結電腦" : "我的已連結電腦"}</h2><p>離線時工作會保留，電腦重新上線後自動接續。</p></div>
          <button className="secondary-button" type="button" disabled={busy || state === "loading"} onClick={() => void loadDevices()}><RefreshCw size={16} aria-hidden="true" />重新整理</button>
        </div>
        <div className="table-wrap">
          <table className="windows-service-table">
            <thead><tr><th>電腦</th><th>版本</th><th>連線</th><th>可處理項目</th><th>最後連線</th><th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>
              {state === "loading" ? <tr><td colSpan={6}>正在讀取...</td></tr> : null}
              {state === "error" ? <tr><td colSpan={6}>目前無法讀取清單。</td></tr> : null}
              {state === "ready" && devices.length === 0 ? <tr><td colSpan={6}>尚未連結解析電腦。</td></tr> : null}
              {state === "ready" ? devices.map((device) => <tr key={device.id}>
                <td><strong>{device.name}</strong><small>{device.id}</small></td>
                <td>{device.serviceVersion}</td>
                <td><span className={`windows-service-status is-${device.connection}`}>{device.connection === "online" ? "在線" : device.connection === "offline" ? "離線" : "已解除"}</span></td>
                <td><div className="windows-service-capabilities">{device.capabilities.length ? device.capabilities.map((capability) => <span className={`is-${capability.status}`} key={capability.code}>{capabilityLabels[capability.code] ?? capability.code}</span>) : <span className="is-blocked">尚未就緒</span>}</div></td>
                <td>{formatTime(device.lastSeenAt)}</td>
                <td>{device.status === "active" && (device.ownedByCurrentUser || canManageAll) ? <button className="danger-button" type="button" disabled={busy} onClick={() => void revoke(device)}><ShieldOff size={15} aria-hidden="true" />解除連結</button> : null}</td>
              </tr>) : null}
            </tbody>
          </table>
        </div>
      </section> : null}
    </div>
  );
}
