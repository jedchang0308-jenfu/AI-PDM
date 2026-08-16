"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, MonitorSmartphone, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { ReasonActionDialog } from "@/components/reason-action-dialog";

type AccountSession = {
  id: string;
  authProvider: "legacy_managed" | "firebase_bff";
  assuranceLevel: "aal1" | "aal2";
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  deviceLabel: string;
  userAgentHint: string;
  ipSummary: string | null;
  issuedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  current: boolean;
};

type CurrentUser = {
  id: string;
  display_name?: string;
  displayName?: string;
  email?: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "未紀錄";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false });
}

function providerLabel(provider: AccountSession["authProvider"]) {
  return provider === "firebase_bff" ? "公司身分服務" : "本機管理登入";
}

function assuranceLabel(level: AccountSession["assuranceLevel"]) {
  return level === "aal2" ? "公司管理雙重驗證" : "單因素驗證";
}

export default function AccountSecurityPage() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<AccountSession | null>(null);

  const activeSessions = useMemo(() => sessions.filter((session) => !session.revokedAt), [sessions]);
  const currentSession = useMemo(() => sessions.find((session) => session.current) ?? null, [sessions]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const [sessionResponse, meResponse] = await Promise.all([
      fetch("/api/account/sessions", { cache: "no-store" }),
      fetch("/api/auth/me", { cache: "no-store" })
    ]);
    const sessionBody = await sessionResponse.json().catch(() => ({}));
    const meBody = await meResponse.json().catch(() => ({}));
    setLoading(false);
    if (!sessionResponse.ok) {
      setMessage({ type: "error", text: sessionBody.message ?? "登入裝置讀取失敗。" });
      return;
    }
    setSessions(Array.isArray(sessionBody.sessions) ? sessionBody.sessions : []);
    if (meResponse.ok) setUser(meBody.user ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(session: AccountSession, reason: string) {
    setBusy(session.id);
    setMessage(null);
    const response = await fetch(`/api/account/sessions/${encodeURIComponent(session.id)}/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "工作階段撤銷失敗。" });
      return false;
    }
    setMessage({ type: "success", text: "已撤銷指定登入裝置。" });
    await load();
    return true;
  }

  async function requestRecovery() {
    if (!user?.email) {
      setMessage({ type: "error", text: "此帳號沒有可用的電子郵件。" });
      return;
    }
    setBusy("recovery");
    setMessage(null);
    const response = await fetch("/api/account-recovery/handoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email })
    });
    const body = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "復原郵件建立失敗。" });
      return;
    }
    setMessage({ type: "success", text: body.message ?? "若帳號符合復原條件，系統會寄出復原郵件。" });
  }

  return (
    <div className="account-security-page">
      <header className="page-header">
        <div>
          <h1>我的帳號安全</h1>
          <p>查看目前登入裝置、撤銷不再使用的工作階段，並前往公司身分服務復原帳號。</p>
        </div>
        <button className="secondary-button" type="button" disabled={loading || Boolean(busy)} onClick={() => void load()}>
          <RefreshCw size={16} aria-hidden="true" />
          重新整理
        </button>
      </header>

      {message ? <div className={`account-console-message is-${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</div> : null}

      <section className="panel account-security-summary">
        <div>
          <span>目前帳號</span>
          <strong>{user?.display_name ?? user?.displayName ?? "已登入使用者"}</strong>
          <small>{user?.email ?? "未紀錄電子郵件"}</small>
        </div>
        <div>
          <span>有效工作階段</span>
          <strong>{activeSessions.length}</strong>
          <small>{currentSession ? `${currentSession.deviceLabel} / ${currentSession.userAgentHint}` : "目前 session 尚未登錄"}</small>
        </div>
        <button className="secondary-button" type="button" disabled={busy === "recovery" || !user?.email} onClick={() => void requestRecovery()}>
          <KeyRound size={16} aria-hidden="true" />
          寄送復原郵件
        </button>
      </section>

      <section className="panel account-session-panel">
        <div className="panel-header">
          <div>
            <h2>登入裝置</h2>
            <p>只顯示裝置摘要、最近活動與縮減 IP；不顯示或保存原始 session token。</p>
          </div>
        </div>

        {loading ? <div className="empty">正在讀取登入裝置...</div> : null}
        {!loading && sessions.length === 0 ? <div className="empty">尚未有可顯示的登入裝置。</div> : null}
        {!loading && sessions.length ? (
          <div className="account-session-list">
            {sessions.map((session) => (
              <article className={`account-session-row${session.current ? " is-current" : ""}${session.revokedAt ? " is-revoked" : ""}`} key={session.id}>
                <div className="account-session-icon">
                  <MonitorSmartphone size={20} aria-hidden="true" />
                </div>
                <div className="account-session-main">
                  <div className="account-session-title">
                    <strong>{session.deviceLabel}</strong>
                    {session.current ? <span className="status-badge privacy-status-acknowledged">目前使用中</span> : null}
                    {session.revokedAt ? <span className="status-badge privacy-status-not_acknowledged">已撤銷</span> : null}
                  </div>
                  <p>{session.userAgentHint} / {providerLabel(session.authProvider)} / {assuranceLabel(session.assuranceLevel)}</p>
                  <dl>
                    <div><dt>最近活動</dt><dd>{formatDateTime(session.lastSeenAt)}</dd></div>
                    <div><dt>建立時間</dt><dd>{formatDateTime(session.issuedAt)}</dd></div>
                    <div><dt>到期時間</dt><dd>{formatDateTime(session.expiresAt)}</dd></div>
                    <div><dt>IP 摘要</dt><dd>{session.ipSummary ?? "未紀錄"}</dd></div>
                  </dl>
                </div>
                <div className="account-session-actions">
                  {session.revokedAt ? (
                    <span className="account-session-state"><XCircle size={15} aria-hidden="true" />{formatDateTime(session.revokedAt)}</span>
                  ) : session.current ? (
                    <span className="account-session-state"><ShieldCheck size={15} aria-hidden="true" />保留目前登入</span>
                  ) : (
                    <button className="danger-button" type="button" disabled={Boolean(busy)} onClick={() => setSessionToRevoke(session)}>
                      {busy === session.id ? "撤銷中..." : "撤銷"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
      <ReasonActionDialog
        open={Boolean(sessionToRevoke)}
        title="撤銷登入裝置"
        description="撤銷後，這個裝置的登入狀態會立即失效。"
        confirmLabel="確認撤銷"
        defaultReason="非本人使用或不再使用此裝置"
        tone="danger"
        busy={Boolean(busy)}
        onCancel={() => setSessionToRevoke(null)}
        onConfirm={async (reason) => {
          if (!sessionToRevoke) return;
          if (await revoke(sessionToRevoke, reason)) setSessionToRevoke(null);
        }}
      />
    </div>
  );
}
