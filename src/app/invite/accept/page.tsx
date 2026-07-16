"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";

type Invitation = {
  email: string;
  displayName: string;
  role: "Engineer" | "R&D Manager" | "Admin" | "Manufacturing" | "Procurement";
  expiresAt: string;
};

const roleLabels: Record<Invitation["role"], string> = {
  Engineer: "研發工程師",
  "R&D Manager": "研發主管",
  Admin: "系統管理員",
  Manufacturing: "製造",
  Procurement: "採購"
};

export default function AcceptInvitationPage() {
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/mode", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { googleOAuth?: { enabled?: boolean } } | null) => setGoogleOAuthEnabled(body?.googleOAuth?.enabled === true))
      .catch(() => setGoogleOAuthEnabled(false));

    const nextToken = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(nextToken);
    if (!nextToken) {
      setError("邀請連結不完整。請重新開啟原始郵件中的連結，或聯絡系統管理員。");
      setLoading(false);
      return;
    }

    fetch(`/api/account-invitations/lookup?token=${encodeURIComponent(nextToken)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message ?? "邀請資料讀取失敗，請稍後重試。");
        setInvitation(body.invitation);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "邀請資料讀取失敗，請稍後重試。"))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致，請重新確認。");
      return;
    }

    setSaving(true);
    const response = await fetch("/api/account-invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message ?? "密碼設定失敗，請稍後重試。");
      setSaving(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="login-page">
      <section className="login-panel invitation-accept-panel">
        <div className="invitation-accept-heading">
          <KeyRound size={24} aria-hidden="true" />
          <div>
            <h1>啟用 AI PDM 帳號</h1>
            <p>使用受邀的 Google 帳號，或自行設定 PDM 密碼。</p>
          </div>
        </div>

        {loading ? <div className="next-step-state compact"><p>正在確認邀請連結...</p></div> : error && !invitation ? (
          <div className="next-step-state compact" role="alert">
            <h3>目前無法設定密碼</h3>
            <p>{error}</p>
            <div className="next-step-actions"><Link className="secondary-button" href="/login">返回登入</Link></div>
          </div>
        ) : invitation ? (
          <>
            <div className="invitation-account-summary">
              <ShieldCheck size={18} aria-hidden="true" />
              <div><span>受邀帳號</span><strong>{invitation.displayName}</strong><small>{invitation.email} / {roleLabels[invitation.role]}</small></div>
            </div>
            <div className="google-auth-choice">
              {googleOAuthEnabled ? (
                <a className="secondary-button google-auth-button" href={`/api/auth/google/start?invite_token=${encodeURIComponent(token)}`}>
                  <KeyRound size={16} aria-hidden="true" />
                  使用 Google 帳號啟用
                </a>
              ) : (
                <button
                  className="secondary-button google-auth-button is-unopened"
                  type="button"
                  disabled
                  title="未開放：Google OAuth 憑證尚未完成設定"
                  aria-label="使用 Google 帳號啟用，未開放：Google OAuth 憑證尚未完成設定"
                >
                  <LockKeyhole size={16} aria-hidden="true" />
                  使用 Google 帳號啟用
                  <span>未開放</span>
                </button>
              )}
              <div className="auth-method-divider"><span>或設定 PDM 密碼</span></div>
            </div>
            <form className="login-form" onSubmit={submit}>
              <label>
                新密碼
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={10} maxLength={128} autoComplete="new-password" required />
                <small>10 至 128 個字元，至少包含一個英文字母與一個數字。</small>
              </label>
              <label>
                再輸入一次
                <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={10} maxLength={128} autoComplete="new-password" required />
              </label>
              {error ? <div className="form-error" role="alert">{error}</div> : null}
              <button className="primary-button" disabled={saving} type="submit">
                <LogIn size={16} aria-hidden="true" />
                {saving ? "啟用中..." : "設定密碼並進入系統"}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </div>
  );
}
