"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, CheckCircle2, ClipboardCopy, KeyRound, RefreshCw, RotateCcw, ShieldOff, UserCog, UserPlus } from "lucide-react";
import AccountInvitationsPage from "../account-invitations/page";
import { ApprovalMatrixSettings } from "../page";

type AccountStatus = "active" | "suspended" | "expired" | "offboarded";
type IdentityStatus = "active" | "disabled";
type IdentityProvider = "local_password" | "google_oauth" | "invite";

type AccountSummary = {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  companyName: string | null;
  accountStatus: AccountStatus;
  systemRoleEnabled: boolean;
  activeIdentityCount: number;
  identityProviders: IdentityProvider[];
  lastLoginAt: string | null;
  sessionInvalidBefore: string | null;
};

type AccountIdentity = {
  id: string;
  provider: IdentityProvider;
  loginIdentifier: string | null;
  emailNormalized: string | null;
  status: IdentityStatus;
  verifiedAt: string | null;
  lastLoginAt: string | null;
};

type AccountDetail = AccountSummary & {
  identities: AccountIdentity[];
  activeRoleAssignments: Array<{
    id: string;
    roleCode: string;
    roleTitle: string;
    startsAt: string | null;
    reviewDueAt: string | null;
    hardEndsAt: string | null;
    reason: string;
  }>;
};

type Tab = "accounts" | "invite" | "roles" | "audit";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "accounts", label: "帳號管理" },
  { id: "invite", label: "邀請新帳號" },
  { id: "roles", label: "角色與權限" },
  { id: "audit", label: "異動紀錄" }
];

const statusOptions: Array<{ value: string; label: string }> = [
  { value: "", label: "全部狀態" },
  { value: "active", label: "可使用" },
  { value: "suspended", label: "已暫停" },
  { value: "expired", label: "已到期" },
  { value: "offboarded", label: "已離職" }
];

function statusLabel(status: AccountStatus) {
  const labels: Record<AccountStatus, string> = {
    active: "可使用",
    suspended: "已暫停",
    expired: "已到期",
    offboarded: "已離職"
  };
  return labels[status];
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    Admin: "系統管理員",
    Engineer: "工程師",
    "R&D Manager": "研發主管",
    Manufacturing: "製造",
    Procurement: "採購"
  };
  return labels[role] ?? role;
}

function identityProviderLabel(provider: IdentityProvider) {
  const labels: Record<IdentityProvider, string> = {
    local_password: "密碼登入",
    google_oauth: "Google 登入",
    invite: "邀請紀錄"
  };
  return labels[provider];
}

function formatDateTime(value: string | null) {
  if (!value) return "未紀錄";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false });
}

export default function AccountsSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("accounts");

  return (
    <div className="account-console-page">
      <header className="page-header">
        <div>
          <h1>帳號與權限</h1>
          <p>集中處理帳號生命週期、邀請、角色權限與異動紀錄；目前工作區固定為鉦富。</p>
        </div>
      </header>

      <div className="account-console-tabs" role="tablist" aria-label="帳號與權限管理分頁">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "primary-button" : "secondary-button"}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "accounts" ? <AccountManagementPanel /> : null}
      {activeTab === "invite" ? <AccountInvitationsPage /> : null}
      {activeTab === "roles" ? <ApprovalMatrixSettings /> : null}
      {activeTab === "audit" ? <AccountAuditGuidance /> : null}
    </div>
  );
}

function AccountManagementPanel() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [resetUrl, setResetUrl] = useState("");
  const didInitialLoad = useRef(false);

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === selectedId) ?? null, [accounts, selectedId]);

  const loadDetail = useCallback(async (userId: string) => {
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(userId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "帳號明細讀取失敗。" });
      return;
    }
    setDetail(body.account ?? null);
  }, []);

  const loadAccounts = useCallback(async (nextSelectedId: string) => {
    setLoading(true);
    setMessage(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (status) params.set("status", status);
    const response = await fetch(`/api/admin/accounts?${params.toString()}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "帳號列表讀取失敗。" });
      return;
    }
    const nextAccounts = Array.isArray(body.accounts) ? body.accounts : [];
    setAccounts(nextAccounts);
    const preserved = nextAccounts.some((account: AccountSummary) => account.id === nextSelectedId) ? nextSelectedId : nextAccounts[0]?.id ?? "";
    setSelectedId(preserved);
    if (preserved) await loadDetail(preserved);
    else setDetail(null);
  }, [loadDetail, query, status]);

  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    void loadAccounts("");
  }, [loadAccounts]);

  async function submitAccountAction(action: string, userId = selectedId) {
    const reason = window.prompt("請輸入異動原因，系統會寫入異動紀錄。");
    if (!reason?.trim()) return;
    setBusy(true);
    setMessage(null);
    setResetUrl("");
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(userId)}/lifecycle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "帳號狀態異動失敗。" });
      return;
    }
    setMessage({ type: "success", text: "帳號狀態已更新。" });
    await loadAccounts(userId);
  }

  async function revokeSessions() {
    if (!selectedId) return;
    const reason = window.prompt("請輸入撤銷登入狀態原因。");
    if (!reason?.trim()) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(selectedId)}/sessions/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "撤銷登入狀態失敗。" });
      return;
    }
    setMessage({ type: "success", text: "此帳號既有登入狀態已失效。" });
    await loadAccounts(selectedId);
  }

  async function updateIdentity(identity: AccountIdentity, status: IdentityStatus) {
    if (!selectedId) return;
    const reason = window.prompt(`請輸入${status === "active" ? "啟用" : "停用"}登入方式原因。`);
    if (!reason?.trim()) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(selectedId)}/identities/${encodeURIComponent(identity.id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, reason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "登入方式異動失敗。" });
      return;
    }
    setMessage({ type: "success", text: "登入方式已更新。" });
    await loadAccounts(selectedId);
  }

  async function createPasswordReset() {
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(selectedId)}/password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expiresInMinutes: 60 })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "密碼重設連結建立失敗。" });
      return;
    }
    setResetUrl(String(body.resetUrl ?? ""));
    setMessage({ type: "success", text: "一次性密碼重設連結已建立，請複製後交給本人。" });
  }

  async function copyResetUrl() {
    if (!resetUrl) return;
    await navigator.clipboard.writeText(resetUrl);
    setMessage({ type: "success", text: "重設連結已複製。" });
  }

  return (
    <section className="panel account-management-panel">
      <div className="account-management-toolbar">
        <label>
          搜尋帳號
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名或電子郵件" />
        </label>
        <label>
          帳號狀態
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={() => void loadAccounts(selectedId)} disabled={loading || busy}>
          <RefreshCw size={16} aria-hidden="true" />
          查詢
        </button>
      </div>

      {message ? <div className={`account-console-message is-${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</div> : null}

      <div className="account-management-layout">
        <div className="table-wrap">
          <table className="account-management-table">
            <thead>
              <tr>
                <th>帳號</th>
                <th>角色</th>
                <th>狀態</th>
                <th>登入方式</th>
                <th>最後登入</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}>正在讀取帳號...</td></tr>
              ) : accounts.length ? accounts.map((account) => (
                <tr
                  key={account.id}
                  className={account.id === selectedId ? "selected-row" : undefined}
                  onClick={() => {
                    setSelectedId(account.id);
                    setResetUrl("");
                    void loadDetail(account.id);
                  }}
                >
                  <td>
                    <strong>{account.displayName}</strong>
                    <small>{account.email ?? account.id}</small>
                  </td>
                  <td>{roleLabel(account.role)}</td>
                  <td>
                    <span className={`account-status-pill is-${account.accountStatus}`}>{statusLabel(account.accountStatus)}</span>
                    {!account.systemRoleEnabled ? <small>系統角色已關閉</small> : null}
                  </td>
                  <td>{account.activeIdentityCount} 個可登入方式</td>
                  <td>{formatDateTime(account.lastLoginAt)}</td>
                </tr>
              )) : (
                <tr><td colSpan={5}>沒有符合條件的帳號。</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="account-detail-panel" aria-label="帳號明細">
          {detail || selectedAccount ? (
            <>
              <div className="account-detail-heading">
                <UserCog size={20} aria-hidden="true" />
                <div>
                  <h2>{(detail ?? selectedAccount)?.displayName}</h2>
                  <p>{(detail ?? selectedAccount)?.email ?? (detail ?? selectedAccount)?.id}</p>
                </div>
              </div>
              <div className="account-detail-actions">
                {detail?.accountStatus === "active" ? (
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => void submitAccountAction("suspend")}>
                    <Ban size={16} aria-hidden="true" />
                    暫停
                  </button>
                ) : null}
                {detail?.accountStatus === "suspended" || detail?.accountStatus === "expired" ? (
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => void submitAccountAction("reactivate")}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    恢復
                  </button>
                ) : null}
                {detail?.accountStatus === "offboarded" ? (
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => void submitAccountAction("return_to_work")}>
                    <RotateCcw size={16} aria-hidden="true" />
                    復職
                  </button>
                ) : null}
                {detail?.accountStatus !== "offboarded" ? (
                  <button className="danger-button" type="button" disabled={busy} onClick={() => void submitAccountAction("offboard")}>
                    <ShieldOff size={16} aria-hidden="true" />
                    離職
                  </button>
                ) : null}
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void revokeSessions()}>
                  <KeyRound size={16} aria-hidden="true" />
                  撤銷登入
                </button>
              </div>

              <dl className="account-detail-facts">
                <div><dt>帳號狀態</dt><dd>{detail ? statusLabel(detail.accountStatus) : "-"}</dd></div>
                <div><dt>工作區</dt><dd>{detail?.companyName ?? "鉦富"}</dd></div>
                <div><dt>既有登入失效時間</dt><dd>{formatDateTime(detail?.sessionInvalidBefore ?? null)}</dd></div>
              </dl>

              <div className="account-detail-section">
                <h3>登入方式</h3>
                {detail?.identities.length ? detail.identities.map((identity) => (
                  <div className="account-identity-row" key={identity.id}>
                    <div>
                      <strong>{identityProviderLabel(identity.provider)}</strong>
                      <small>{identity.emailNormalized ?? identity.loginIdentifier ?? identity.id}</small>
                      <small>最後登入：{formatDateTime(identity.lastLoginAt)}</small>
                    </div>
                    <button
                      className={identity.status === "active" ? "danger-button" : "secondary-button"}
                      type="button"
                      disabled={busy || identity.provider === "invite"}
                      onClick={() => void updateIdentity(identity, identity.status === "active" ? "disabled" : "active")}
                    >
                      {identity.status === "active" ? "停用" : "啟用"}
                    </button>
                  </div>
                )) : <p>尚未建立登入方式。</p>}
              </div>

              <div className="account-detail-section">
                <h3>密碼重設</h3>
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void createPasswordReset()}>
                  <KeyRound size={16} aria-hidden="true" />
                  建立一次性連結
                </button>
                {resetUrl ? (
                  <div className="account-reset-link">
                    <input value={resetUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                    <button className="secondary-button" type="button" onClick={() => void copyResetUrl()}>
                      <ClipboardCopy size={16} aria-hidden="true" />
                      複製
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty">請先選擇一個帳號。</div>
          )}
        </aside>
      </div>
    </section>
  );
}

function AccountAuditGuidance() {
  return (
    <section className="panel account-audit-panel">
      <div className="panel-header">
        <div>
          <h2>異動紀錄</h2>
          <p>帳號狀態、登入方式、密碼重設與角色權限異動都會寫入 audit log。</p>
        </div>
      </div>
      <div className="empty">
        目前帳號生命週期異動可在帳號明細與 audit log 中追蹤；角色權限異動請切到「角色與權限」查看權限異動紀錄。
      </div>
    </section>
  );
}
