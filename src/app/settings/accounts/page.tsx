"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, CheckCircle2, ClipboardCopy, KeyRound, RefreshCw, RotateCcw, ShieldCheck, ShieldOff, UserCog, UserPlus } from "lucide-react";
import { ReasonActionDialog } from "@/components/reason-action-dialog";
import { SearchHighlight } from "@/components/search-highlight";
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

type AccountLoginAlias = {
  id: string;
  aliasNormalized: string;
  providerRoute: "firebase_google";
  status: "active" | "retired";
  createdAt: string;
  retiredAt: string | null;
  reason: string;
  rowVersion: number;
};

type AccountDetail = AccountSummary & {
  identities: AccountIdentity[];
  loginAliases: AccountLoginAlias[];
  privacyEvidence: {
    requiredVersion: string;
    requiredContentSha256: string;
    effectiveAt: string | null;
    acknowledgedVersion: string | null;
    acknowledgedContentSha256: string | null;
    acknowledgedAt: string | null;
    source: string | null;
    status: "acknowledged" | "reacknowledgement_required" | "not_acknowledged";
  };
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

type ReasonActionRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  defaultReason?: string;
  tone?: "default" | "danger";
  execute: (reason: string) => Promise<boolean>;
};

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
  const [loginAlias, setLoginAlias] = useState("");
  const [loginAliasReason, setLoginAliasReason] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonActionRequest | null>(null);
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

  async function submitAccountAction(action: string, userId: string, reason: string) {
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
      return false;
    }
    setMessage({ type: "success", text: "帳號狀態已更新。" });
    await loadAccounts(userId);
    return true;
  }

  async function revokeSessions(reason: string) {
    if (!selectedId) return false;
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
      return false;
    }
    setMessage({ type: "success", text: "此帳號既有登入狀態已失效。" });
    await loadAccounts(selectedId);
    return true;
  }

  async function updateIdentity(identity: AccountIdentity, status: IdentityStatus, reason: string) {
    if (!selectedId) return false;
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
      return false;
    }
    setMessage({ type: "success", text: "登入方式已更新。" });
    await loadAccounts(selectedId);
    return true;
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
    if (body.handoff?.delivery === "provider_managed_email") {
      setResetUrl("");
      setMessage({ type: "success", text: "已要求供應商寄送帳號復原郵件；AI PDM 未建立或保存重設 token。" });
      return;
    }
    setResetUrl(String(body.resetUrl ?? ""));
    setMessage({ type: "success", text: "一次性密碼重設連結已建立，請複製後交給本人。" });
  }

  async function createLoginAlias(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !loginAlias.trim() || !loginAliasReason.trim()) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(selectedId)}/login-aliases`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alias: loginAlias, reason: loginAliasReason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "工號別名新增失敗。" });
      return;
    }
    setLoginAlias("");
    setLoginAliasReason("");
    setMessage({ type: "success", text: "工號別名已新增。" });
    await loadAccounts(selectedId);
  }

  async function retireLoginAlias(alias: AccountLoginAlias, reason: string) {
    if (!selectedId) return false;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/admin/accounts/${encodeURIComponent(selectedId)}/login-aliases/${encodeURIComponent(alias.id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rowVersion: alias.rowVersion, reason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "工號別名退役失敗。" });
      return false;
    }
    setMessage({ type: "success", text: "工號別名已退役。" });
    await loadAccounts(selectedId);
    return true;
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
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名、電子郵件或工號" />
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
                    <strong><SearchHighlight value={account.displayName} query={query} /></strong>
                    <small><SearchHighlight value={account.email ?? account.id} query={query} /></small>
                  </td>
                  <td><SearchHighlight value={roleLabel(account.role)} query={query} /></td>
                  <td>
                    <span className={`account-status-pill is-${account.accountStatus}`}><SearchHighlight value={statusLabel(account.accountStatus)} query={query} /></span>
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
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => setReasonAction({ title: "暫停帳號", description: "暫停後，此帳號將不能再登入；原因會寫入異動紀錄。", confirmLabel: "確認暫停", tone: "danger", execute: (reason) => submitAccountAction("suspend", selectedId, reason) })}>
                    <Ban size={16} aria-hidden="true" />
                    暫停
                  </button>
                ) : null}
                {detail?.accountStatus === "suspended" || detail?.accountStatus === "expired" ? (
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => setReasonAction({ title: "恢復帳號", description: "恢復後，此帳號可依既有登入方式重新使用系統。", confirmLabel: "確認恢復", execute: (reason) => submitAccountAction("reactivate", selectedId, reason) })}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    恢復
                  </button>
                ) : null}
                {detail?.accountStatus === "offboarded" ? (
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => setReasonAction({ title: "復職帳號", description: "復職會重新開啟系統角色；登入方式仍依個別狀態管理。", confirmLabel: "確認復職", execute: (reason) => submitAccountAction("return_to_work", selectedId, reason) })}>
                    <RotateCcw size={16} aria-hidden="true" />
                    復職
                  </button>
                ) : null}
                {detail?.accountStatus !== "offboarded" ? (
                  <button className="danger-button" type="button" disabled={busy} onClick={() => setReasonAction({ title: "辦理離職", description: "離職會關閉系統角色與登入方式，並撤銷既有登入狀態。", confirmLabel: "確認離職", tone: "danger", execute: (reason) => submitAccountAction("offboard", selectedId, reason) })}>
                    <ShieldOff size={16} aria-hidden="true" />
                    離職
                  </button>
                ) : null}
                <button className="secondary-button" type="button" disabled={busy} onClick={() => setReasonAction({ title: "撤銷既有登入", description: "目前帳號的既有登入狀態會失效；使用者需重新登入。", confirmLabel: "確認撤銷", tone: "danger", execute: revokeSessions })}>
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
                      onClick={() => {
                        const nextStatus = identity.status === "active" ? "disabled" : "active";
                        setReasonAction({
                          title: nextStatus === "active" ? "啟用登入方式" : "停用登入方式",
                          description: nextStatus === "active" ? "啟用後可使用這個登入方式進入系統。" : "停用後無法再使用這個登入方式。",
                          confirmLabel: nextStatus === "active" ? "確認啟用" : "確認停用",
                          tone: nextStatus === "active" ? "default" : "danger",
                          execute: (reason) => updateIdentity(identity, nextStatus, reason)
                        });
                      }}
                    >
                      {identity.status === "active" ? "停用" : "啟用"}
                    </button>
                  </div>
                )) : <p>尚未建立登入方式。</p>}
              </div>

              <div className="account-detail-section">
                <h3>工號／登入別名</h3>
                <p className="account-section-note">工號只負責導向公司 Google／Cloud Identity 驗證，不是密碼或權限來源。</p>
                {detail?.loginAliases?.length ? detail.loginAliases.map((alias) => (
                  <div className="account-identity-row" key={alias.id}>
                    <div>
                      <strong>{alias.aliasNormalized}</strong>
                      <small>公司 Google／Cloud Identity</small>
                      <small>{alias.status === "active" ? `啟用於 ${formatDateTime(alias.createdAt)}` : `已於 ${formatDateTime(alias.retiredAt)}退役`}</small>
                    </div>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={busy || alias.status !== "active"}
                      onClick={() => setReasonAction({ title: "退役工號", description: "原工號會保留在歷史紀錄中，不能直接改寫。", confirmLabel: "確認退役", defaultReason: "人員或工號異動", tone: "danger", execute: (reason) => retireLoginAlias(alias, reason) })}
                    >
                      {alias.status === "active" ? "退役" : "已退役"}
                    </button>
                  </div>
                )) : <p>尚未設定工號別名。</p>}
                <form className="account-login-alias-form" onSubmit={createLoginAlias}>
                  <label>
                    工號
                    <input
                      value={loginAlias}
                      onChange={(event) => setLoginAlias(event.target.value.toUpperCase())}
                      placeholder="例如 JF00123"
                      autoComplete="off"
                      maxLength={32}
                      disabled={busy || detail?.accountStatus !== "active"}
                      required
                    />
                  </label>
                  <label>
                    新增原因
                    <input
                      value={loginAliasReason}
                      onChange={(event) => setLoginAliasReason(event.target.value)}
                      placeholder="例如 新進人員帳號建立"
                      maxLength={500}
                      disabled={busy || detail?.accountStatus !== "active"}
                      required
                    />
                  </label>
                  <button className="secondary-button" type="submit" disabled={busy || detail?.accountStatus !== "active" || !loginAlias.trim() || !loginAliasReason.trim()}>
                    <KeyRound size={16} aria-hidden="true" />
                    新增工號
                  </button>
                </form>
              </div>

              <div className="account-detail-section">
                <div className="account-section-heading">
                  <h3>個人資料告知確認</h3>
                  <span className={`status-badge privacy-status-${detail?.privacyEvidence.status ?? "not_acknowledged"}`}>
                    {detail?.privacyEvidence.status === "acknowledged"
                      ? "已確認"
                      : detail?.privacyEvidence.status === "reacknowledgement_required"
                        ? "需重新確認"
                        : "尚未確認"}
                  </span>
                </div>
                <dl className="account-detail-facts privacy-evidence-facts">
                  <div><dt>目前要求版本</dt><dd>{detail ? `Pilot v${detail.privacyEvidence.requiredVersion}` : "-"}</dd></div>
                  <div><dt>已確認版本</dt><dd>{detail?.privacyEvidence.acknowledgedVersion ? `Pilot v${detail.privacyEvidence.acknowledgedVersion}` : "尚未確認"}</dd></div>
                  <div><dt>確認時間</dt><dd>{formatDateTime(detail?.privacyEvidence.acknowledgedAt ?? null)}</dd></div>
                  <div><dt>生效時間</dt><dd>{formatDateTime(detail?.privacyEvidence.effectiveAt ?? null)}</dd></div>
                </dl>
                <p className="account-section-note privacy-evidence-hash" title={detail?.privacyEvidence.requiredContentSha256 ?? undefined}>
                  <ShieldCheck size={15} aria-hidden="true" />
                  版本內容 SHA-256：{detail?.privacyEvidence.requiredContentSha256 ?? "-"}
                </p>
                <p className="account-section-note">管理員只能查閱證據，不能代替員工確認或修改歷史紀錄。</p>
              </div>

              <div className="account-detail-section">
                <h3>帳號復原</h3>
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void createPasswordReset()}>
                  <KeyRound size={16} aria-hidden="true" />
                  建立或寄送復原
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
      <ReasonActionDialog
        open={Boolean(reasonAction)}
        title={reasonAction?.title ?? "確認操作"}
        description={reasonAction?.description ?? "請填寫原因後確認。"}
        confirmLabel={reasonAction?.confirmLabel ?? "確認"}
        defaultReason={reasonAction?.defaultReason}
        tone={reasonAction?.tone}
        busy={busy}
        onCancel={() => setReasonAction(null)}
        onConfirm={async (reason) => {
          if (!reasonAction) return;
          if (await reasonAction.execute(reason)) setReasonAction(null);
        }}
      />
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
