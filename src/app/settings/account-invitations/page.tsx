"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, ClipboardCopy, Mail, RefreshCw, RotateCcw, Send, UserPlus, X } from "lucide-react";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { getStatusDisplay } from "@/lib/status-display";

type InvitationRole = "Engineer" | "R&D Manager" | "Admin" | "Manufacturing" | "Procurement";
type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

type Invitation = {
  id: string;
  email: string;
  displayName: string;
  role: InvitationRole;
  status: InvitationStatus;
  invitedByName: string | null;
  invitedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

type CreatedInvitation = {
  invitation: Invitation;
  inviteUrl: string | null;
  delivery: "manual_email" | "firebase_managed_email";
};

const roleOptions: Array<{ value: InvitationRole; label: string }> = [
  { value: "Engineer", label: "研發工程師" },
  { value: "R&D Manager", label: "研發主管" },
  { value: "Manufacturing", label: "製造" },
  { value: "Procurement", label: "採購" },
  { value: "Admin", label: "系統管理員" }
];

function roleLabel(role: InvitationRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

function statusLabel(status: InvitationStatus) {
  return getStatusDisplay(status, "invitationStatus").label;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false });
}

export default function AccountInvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitationRole>("Engineer");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [reissueInvitationId, setReissueInvitationId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isReissuing = reissueInvitationId !== null;

  const mailtoHref = useMemo(() => {
    if (!created?.inviteUrl) return "";
    const subject = "AI PDM 帳號邀請";
    const body = [
      `${created.invitation.displayName} 您好：`,
      "",
      "請開啟以下連結設定 AI PDM 密碼：",
      created.inviteUrl,
      "",
      `邀請期限：${formatDateTime(created.invitation.expiresAt)}`,
      "此連結只能使用一次；若已到期，請聯絡系統管理員重新邀請。"
    ].join("\n");
    return `mailto:${encodeURIComponent(created.invitation.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [created]);

  async function loadInvitations() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/admin/account-invitations", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const text = response.status === 401
        ? "請先登入系統管理員帳號，再管理邀請。"
        : response.status === 403
          ? "只有系統管理員可以管理帳號邀請。"
          : body.message ?? "邀請紀錄讀取失敗，請稍後重試。";
      setMessage({ type: "error", text });
      setLoading(false);
      return;
    }
    setInvitations(Array.isArray(body.invitations) ? body.invitations : []);
    setLoading(false);
  }

  useEffect(() => {
    void loadInvitations();
  }, []);

  function beginReissue(invitation: Invitation) {
    setReissueInvitationId(invitation.id);
    setDisplayName(invitation.displayName);
    setEmail(invitation.email);
    setRole(invitation.role);
    setCreated(null);
    setMessage({ type: "success", text: "已帶入撤銷邀請資料。確認姓名、角色與期限後，重新寄出邀請。" });
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector<HTMLInputElement>('input[name="displayName"]')?.focus();
    });
  }

  function cancelReissue() {
    setReissueInvitationId(null);
    setDisplayName("");
    setEmail("");
    setRole("Engineer");
    setMessage(null);
  }

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedReissueId = reissueInvitationId;
    setSaving(true);
    setCreated(null);
    setMessage(null);
    const response = await fetch("/api/admin/account-invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, email, role, expiresInDays, reissueInvitationId: requestedReissueId })
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "邀請建立失敗，請確認資料後重試。" });
      return;
    }
    const delivery = body.delivery === "firebase_managed_email" ? "firebase_managed_email" : "manual_email";
    setCreated({
      invitation: body.invitation,
      inviteUrl: typeof body.inviteUrl === "string" && body.inviteUrl ? body.inviteUrl : null,
      delivery
    });
    const successMessage = delivery === "firebase_managed_email"
      ? requestedReissueId
        ? "邀請信已重新寄出。下一步請通知受邀者檢查公司信箱與垃圾郵件。"
        : "邀請信已寄出。下一步請通知受邀者檢查公司信箱與垃圾郵件。"
      : requestedReissueId
        ? "新邀請連結已建立。下一步請開啟郵件並完成寄送。"
        : "邀請連結已建立。下一步請開啟郵件並完成寄送。";
    setMessage({ type: "success", text: successMessage });
    setDisplayName("");
    setEmail("");
    setReissueInvitationId(null);
    await loadInvitations();
    setMessage({ type: "success", text: successMessage });
  }

  async function copyInviteLink() {
    if (!created?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setMessage({ type: "success", text: "邀請連結已複製。請貼到公司核准的通訊工具並寄給受邀者。" });
    } catch {
      setMessage({ type: "error", text: "瀏覽器無法自動複製。請選取下方連結後手動複製。" });
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    const confirmed = window.confirm(`撤銷 ${invitation.email} 的邀請後，原連結會立即失效。是否繼續？`);
    if (!confirmed) return;
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/admin/account-invitations", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke", invitationId: invitation.id })
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage({ type: "error", text: body.message ?? "邀請撤銷失敗，請重新整理後重試。" });
      return;
    }
    if (created?.invitation.id === invitation.id) setCreated(null);
    setMessage({ type: "success", text: "邀請已撤銷；原連結無法再設定密碼。" });
    await loadInvitations();
    setMessage({ type: "success", text: "邀請已撤銷；原連結無法再設定密碼。" });
  }

  return (
    <div className="account-invitations-page">
      <header className="page-header">
        <div>
          <h1>帳號邀請 <StatusScopeHelp scope="invitationList" /></h1>
          <p>建立帳號邀請，讓內部人員依收到的連結完成啟用。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadInvitations()} disabled={loading || saving}>
          <RefreshCw size={16} aria-hidden="true" />
          重新整理
        </button>
      </header>

      <section className="panel account-invitation-workspace" aria-labelledby="create-invitation-heading">
        <div className="account-invitation-form-band">
          <div className="account-invitation-heading">
            <UserPlus size={20} aria-hidden="true" />
            <div>
              <h2 id="create-invitation-heading">{isReissuing ? "重新邀請內部人員" : "邀請內部人員"}</h2>
              <p>{isReissuing ? "已選取撤銷邀請；確認資料後將重新寄出，原稽核紀錄會保留。" : "目前工作區固定為鉦富；受邀者完成密碼設定後才會建立可登入帳號。"}</p>
            </div>
          </div>

          <form ref={formRef} className="account-invitation-form" onSubmit={createInvitation}>
            <label>
              姓名
              <input name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="off" required />
            </label>
            <label>
              公司電子郵件
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" maxLength={254} autoComplete="email" readOnly={isReissuing} required />
            </label>
            <label>
              初始角色
              <select value={role} onChange={(event) => setRole(event.target.value as InvitationRole)}>
                {roleOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              有效期限
              <select value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}>
                <option value={3}>3 天</option>
                <option value={7}>7 天</option>
                <option value={14}>14 天</option>
                <option value={30}>30 天</option>
              </select>
            </label>
            <div className="account-invitation-form-actions">
              <button className="primary-button account-invitation-submit" type="submit" disabled={saving}>
                <Send size={16} aria-hidden="true" />
                {saving ? (isReissuing ? "重新寄送中..." : "建立中...") : (isReissuing ? "重新寄出邀請" : "建立邀請")}
              </button>
              {isReissuing ? (
                <button className="secondary-button" type="button" onClick={cancelReissue} disabled={saving}>
                  <X size={16} aria-hidden="true" />
                  取消重邀
                </button>
              ) : null}
            </div>
          </form>
        </div>

        {message ? <div className={`account-invitation-message is-${message.type}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</div> : null}

        {created ? (
          <div className={`account-invitation-created${created.delivery === "firebase_managed_email" ? " is-managed-delivery" : ""}`} aria-label="新建立的邀請">
            {created.delivery === "firebase_managed_email" ? (
              <div>
                <strong>邀請信已寄出</strong>
                <p>已寄至 {created.invitation.email}。目前不用再傳送連結；若未收到，請先檢查垃圾郵件，再由管理員撤銷並重新邀請。</p>
              </div>
            ) : (
              <>
                <div>
                  <strong>下一步：寄出邀請</strong>
                  <p>請開啟預填郵件完成寄送，或複製連結後使用公司核准的通訊工具傳送。</p>
                </div>
                <label>
                  一次性邀請連結
                  <input value={created.inviteUrl ?? ""} readOnly onFocus={(event) => event.currentTarget.select()} />
                </label>
                <div className="account-invitation-created-actions">
                  <a className="primary-button" href={mailtoHref}>
                    <Mail size={16} aria-hidden="true" />
                    開啟郵件
                  </a>
                  <button className="secondary-button" type="button" onClick={() => void copyInviteLink()}>
                    <ClipboardCopy size={16} aria-hidden="true" />
                    複製連結
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        <div className="account-invitation-list-band">
          <div className="account-invitation-list-heading">
            <div>
              <h2>邀請紀錄</h2>
              <p>邀請只在建立當下寄送或顯示；未收到時請先檢查垃圾郵件，再撤銷並重新邀請。</p>
            </div>
            <span>{invitations.length} 筆</span>
          </div>

          {loading ? <div className="empty">正在讀取邀請紀錄...</div> : invitations.length === 0 ? (
            <div className="empty">尚無邀請紀錄。請使用上方表單建立第一個邀請。</div>
          ) : (
            <div className="table-wrap">
              <table className="account-invitation-table">
                <thead>
                  <tr>
                    <th>使用者</th>
                    <th>角色</th>
                    <th>狀態</th>
                    <th>有效期限</th>
                    <th>邀請者</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((invitation) => (
                    <tr key={invitation.id}>
                      <td><strong>{invitation.displayName}</strong><small>{invitation.email}</small></td>
                      <td>{roleLabel(invitation.role)}</td>
                      <td><span className={`account-invitation-status is-${invitation.status}`}>{statusLabel(invitation.status)}</span></td>
                      <td>{formatDateTime(invitation.expiresAt)}</td>
                      <td>{invitation.invitedByName ?? "系統管理員"}</td>
                      <td>
                        {invitation.status === "pending" ? (
                          <button className="danger-button" type="button" onClick={() => void revokeInvitation(invitation)} disabled={saving}>
                            <Ban size={15} aria-hidden="true" />
                            撤銷
                          </button>
                        ) : invitation.status === "revoked" ? (
                          <button className="secondary-button" type="button" onClick={() => beginReissue(invitation)} disabled={saving}>
                            <RotateCcw size={15} aria-hidden="true" />
                            重新邀請
                          </button>
                        ) : <span className="account-invitation-no-action">不用處理</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <p className="account-invitation-footer"><Link href="/login">前往登入頁</Link></p>
    </div>
  );
}
