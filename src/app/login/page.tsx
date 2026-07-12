"use client";

import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, LogIn } from "lucide-react";

const TEST_ACCOUNTS = [
  {
    label: "工程師",
    role: "Engineer",
    email: "engineer@example.com",
    password: "pdm-demo",
    note: "可建立與查看自己的送審資料，不可審核或調整系統設定。"
  },
  {
    label: "研發主管",
    role: "R&D Manager",
    email: "manager@example.com",
    password: "pdm-demo",
    note: "可查看送審資料並執行核准、駁回與發布流程。"
  },
  {
    label: "系統管理員",
    role: "Admin",
    email: "admin@example.com",
    password: "pdm-demo",
    note: "可審核送審資料，並可進入系統設定。"
  }
] as const;

const googleErrorMessages: Record<string, string> = {
  google_cancelled: "Google 登入已取消。",
  google_account_not_linked: "此 Google 帳號尚未連結 PDM 帳號，請先使用管理員提供的邀請連結啟用。",
  google_account_inactive: "此 PDM 帳號目前無法登入，請聯絡系統管理員。",
  google_invitation_email_mismatch: "Google 帳號與受邀電子郵件不一致，請改用受邀帳號。",
  google_invitation_unavailable: "這份邀請目前無法使用，請聯絡系統管理員重新邀請。",
  google_identity_conflict: "此 Google 身分已有其他連結，請聯絡系統管理員處理。",
  google_invalid_state: "Google 登入狀態已失效，請重新開始。",
  google_unavailable: "Google 登入尚未完成系統設定。",
  google_failed: "Google 登入未完成，請稍後再試。"
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"demo" | "managed" | null>(null);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/mode")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { authMode?: "demo" | "managed"; googleOAuth?: { enabled?: boolean } } | null) => {
        setAuthMode(body?.authMode ?? "managed");
        setGoogleOAuthEnabled(body?.googleOAuth?.enabled === true);
      })
      .catch(() => {
        setAuthMode("managed");
        setGoogleOAuthEnabled(false);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) setError(googleErrorMessages[authError] ?? googleErrorMessages.google_failed);
    const accountKey = params.get("account");
    if (!accountKey) return;

    const account = TEST_ACCOUNTS.find(
      (item) => item.role.toLowerCase() === accountKey.toLowerCase() || item.email.toLowerCase() === accountKey.toLowerCase()
    );
    if (account) fillTestAccount(account);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(body.error ?? "登入失敗");
      setLoading(false);
      return;
    }

    window.location.href = "/";
  }

  function fillTestAccount(account: (typeof TEST_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError("");
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className={`login-heading ${authMode === "demo" ? "is-demo" : "is-managed"}`}>
          <h1>AI PDM 登入</h1>
          <p>{authMode === "demo" ? "請使用測試帳號登入，依角色權限檢視系統。" : "請使用公司帳號登入；若尚未有帳號，請向系統管理員索取邀請連結。"}</p>
        </div>

        {authMode === "demo" ? <div className="test-account-card" aria-label="測試帳號">
          <div>
            <span>內建測試帳號</span>
            <strong>請選擇要測試的權限角色</strong>
          </div>
          <div className="test-account-list">
            {TEST_ACCOUNTS.map((account) => (
              <div className="test-account-option" key={account.role}>
                <div>
                  <span>角色</span>
                  <strong>
                    {account.label}
                  </strong>
                </div>
                <div>
                  <span>電子郵件</span>
                  <strong>{account.email}</strong>
                </div>
                <div>
                  <span>密碼</span>
                  <strong>{account.password}</strong>
                </div>
                <p>{account.note}</p>
                <a
                  className="secondary-button"
                  href={`/api/auth/login?account=${encodeURIComponent(account.role)}`}
                  onPointerDown={() => fillTestAccount(account)}
                  onClick={(event) => {
                    event.preventDefault();
                    fillTestAccount(account);
                  }}
                >
                  帶入此角色
                </a>
              </div>
            ))}
          </div>
        </div> : null}

        {authMode === "managed" ? (
          <div className="google-auth-choice">
            {googleOAuthEnabled ? (
              <a className="secondary-button google-auth-button" href="/api/auth/google/start">
                <KeyRound size={16} aria-hidden="true" />
                使用 Google 帳號登入
              </a>
            ) : (
              <button
                className="secondary-button google-auth-button is-unopened"
                type="button"
                disabled
                title="未開放：Google OAuth 憑證尚未完成設定"
                aria-label="使用 Google 帳號登入，未開放：Google OAuth 憑證尚未完成設定"
              >
                <LockKeyhole size={16} aria-hidden="true" />
                使用 Google 帳號登入
                <span>未開放</span>
              </button>
            )}
            <div className="auth-method-divider"><span>或使用密碼</span></div>
          </div>
        ) : null}

        <form onSubmit={submit} className="login-form">
          <label>
            電子郵件
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            密碼
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="請輸入密碼"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="primary-button" disabled={loading} type="submit">
            <LogIn size={16} aria-hidden="true" />
            {loading ? "登入中..." : "登入"}
          </button>
        </form>
      </section>
    </div>
  );
}
