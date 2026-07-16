"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, LockKeyhole, LogIn, ShieldCheck, X } from "lucide-react";
import type { AuthMode, FirebaseWebConfig } from "@/lib/auth-config";
import {
  completeFirebaseTotp,
  exchangeFirebaseBffSession,
  firebaseLoginErrorMessage,
  signInFirebaseGoogle,
  signInFirebasePassword,
  type FirebaseSignInResult,
  type FirebaseTotpChallenge
} from "@/lib/firebase-client-auth";

type FirebaseAuthenticatedResult = Extract<FirebaseSignInResult, { kind: "authenticated" }>;

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
  const [totpCode, setTotpCode] = useState("");
  const [totpChallenge, setTotpChallenge] = useState<FirebaseTotpChallenge | null>(null);
  const [pendingLoginIntentToken, setPendingLoginIntentToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginOperation, setLoginOperation] = useState<"google" | "password" | "totp" | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseWebConfig | null>(null);

  function loginReturnTo() {
    const candidate = new URLSearchParams(window.location.search).get("returnTo") ?? "/";
    return candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\") ? candidate : "/";
  }

  useEffect(() => {
    fetch("/api/auth/mode")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { authMode?: AuthMode; googleOAuth?: { enabled?: boolean }; firebase?: { config?: FirebaseWebConfig | null } } | null) => {
        setAuthMode(body?.authMode ?? "managed");
        setGoogleOAuthEnabled(body?.googleOAuth?.enabled === true);
        setFirebaseConfig(body?.firebase?.config ?? null);
      })
      .catch(() => {
        setAuthMode("managed");
        setGoogleOAuthEnabled(false);
        setFirebaseConfig(null);
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
    setNotice("");

    if (authMode === "firebase_bff") {
      if (!firebaseConfig) {
        setError("Firebase 登入尚未完成系統設定。");
        setLoading(false);
        setLoginOperation(null);
        return;
      }
      try {
        const identifier = email.trim();
        if (!identifier.includes("@")) {
          setLoginOperation("google");
          const response = await fetch("/api/auth/employee-login-intents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ identifier, returnPath: loginReturnTo() })
          });
          const body = (await response.json().catch(() => ({}))) as { intentToken?: string; error?: string };
          if (!response.ok || !body.intentToken) throw new Error(body.error || "EMPLOYEE_LOGIN_INTENT_FAILED");
          await finishFirebaseSignIn(await signInFirebaseGoogle(firebaseConfig), body.intentToken);
        } else {
          setLoginOperation("password");
          await finishFirebaseSignIn(await signInFirebasePassword(firebaseConfig, identifier, password));
        }
      } catch (firebaseError) {
        const message = firebaseError instanceof Error && firebaseError.message.startsWith("登入")
          ? firebaseError.message
          : firebaseLoginErrorMessage(firebaseError);
        setError(message);
        setLoading(false);
        setLoginOperation(null);
      }
      return;
    }

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error ?? "登入失敗");
      setLoading(false);
      setLoginOperation(null);
      return;
    }
    window.location.href = "/";
  }

  async function finishFirebaseSignIn(result: FirebaseSignInResult, loginIntentToken = "") {
    if (result.kind === "totp_required") {
      setTotpChallenge(result.challenge);
      setPendingLoginIntentToken(loginIntentToken);
      setTotpCode("");
      setLoading(false);
      setLoginOperation(null);
      return;
    }
    await finishFirebaseBffLogin(result.user, result.auth, loginIntentToken);
  }

  async function finishFirebaseBffLogin(
    user: FirebaseAuthenticatedResult["user"],
    auth: FirebaseAuthenticatedResult["auth"],
    loginIntentToken = ""
  ) {
    const exchange = await exchangeFirebaseBffSession(user, auth, {
      loginIntentToken: loginIntentToken || undefined,
      returnTo: loginReturnTo()
    });
    window.location.href = exchange.kind === "privacy_ack_required" ? exchange.acknowledgementUrl : loginReturnTo();
  }

  async function submitTotp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!totpChallenge) return;
    setLoading(true);
    setLoginOperation("totp");
    setError("");
    try {
      const result = await completeFirebaseTotp(totpChallenge, totpCode);
      await finishFirebaseBffLogin(result.user, result.auth, pendingLoginIntentToken);
    } catch (firebaseError) {
      setError(firebaseLoginErrorMessage(firebaseError));
      setLoading(false);
      setLoginOperation(null);
    }
  }

  async function submitGoogle() {
    if (!firebaseConfig) return;
    setLoading(true);
    setLoginOperation("google");
    setError("");
    setNotice("");
    try {
      await finishFirebaseSignIn(await signInFirebaseGoogle(firebaseConfig));
    } catch (firebaseError) {
      setError(firebaseLoginErrorMessage(firebaseError));
      setLoading(false);
      setLoginOperation(null);
    }
  }

  function fillTestAccount(account: (typeof TEST_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError("");
    setNotice("");
  }

  const employeeAliasLogin = authMode === "firebase_bff" && email.trim().length > 0 && !email.includes("@");

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

        {authMode !== "demo" && !totpChallenge ? (
          <div className="google-auth-choice">
            {googleOAuthEnabled ? (
              authMode === "firebase_bff" ? (
                <button className="secondary-button google-auth-button" type="button" disabled={loading} onClick={submitGoogle}>
                  <KeyRound size={16} aria-hidden="true" />
                  {loginOperation === "google" ? "等待 Google 帳號選擇..." : "使用 Google 帳號登入"}
                </button>
              ) : (
                <a className="secondary-button google-auth-button" href="/api/auth/google/start">
                  <KeyRound size={16} aria-hidden="true" />
                  使用 Google 帳號登入
                </a>
              )
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
            {loginOperation === "google" ? (
              <div className="login-operation-status" role="status">
                <span>Google 登入視窗已開啟，請完成公司帳號選擇。</span>
                <button className="secondary-button login-operation-cancel" type="button" onClick={() => window.location.reload()}>
                  <X size={16} aria-hidden="true" />
                  取消登入
                </button>
              </div>
            ) : null}
            <div className="auth-method-divider"><span>{authMode === "firebase_bff" ? "或輸入公司帳號／工號" : "或使用密碼"}</span></div>
          </div>
        ) : null}

        <form onSubmit={totpChallenge ? submitTotp : submit} className="login-form">
          {totpChallenge ? (
            <label>
              驗證碼
              <input
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/gu, "").slice(0, 8))}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="請輸入驗證碼"
                required
                autoFocus
              />
            </label>
          ) : (
            <>
              <label>
                {authMode === "firebase_bff" ? "公司電子郵件或工號" : "電子郵件"}
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type={authMode === "firebase_bff" ? "text" : "email"}
                  placeholder={authMode === "firebase_bff" ? "name@company.com 或工號" : "you@company.com"}
                  autoComplete={authMode === "firebase_bff" ? "username" : "email"}
                  required
                />
              </label>
              {employeeAliasLogin ? (
                <small className="login-provider-note">工號只用來找到公司帳號；密碼與驗證由公司身分服務處理，AI PDM 不會保存。</small>
              ) : (
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
              )}
            </>
          )}
          {notice ? <div className="form-success" role="status">{notice}</div> : null}
          {error ? <div className="form-error">{error}</div> : null}
          <button className="primary-button" disabled={loading} type="submit">
            {totpChallenge ? <ShieldCheck size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
            {loading ? "處理中..." : totpChallenge ? "驗證" : employeeAliasLogin ? "繼續公司帳號驗證" : "登入"}
          </button>
          {totpChallenge ? (
            <button
              className="secondary-button"
              disabled={loading}
              type="button"
              onClick={() => {
                  setTotpChallenge(null);
                  setPendingLoginIntentToken("");
                  setTotpCode("");
                  setError("");
                  setLoginOperation(null);
                }}
            >
              返回其他登入方式
            </button>
          ) : null}
        </form>
        <div className="login-privacy-footer">
          <Link href="/account-recovery/request">忘記密碼</Link>
          <Link href="/privacy">隱私與資料使用</Link>
        </div>
      </section>
    </div>
  );
}
