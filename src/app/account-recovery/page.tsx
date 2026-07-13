"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

type RecoveryState =
  | { status: "loading" }
  | { status: "ready"; account: { displayName: string; email: string | null } }
  | { status: "done" }
  | { status: "error"; message: string };

function tokenFromHash() {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("token") ?? "";
}

export default function AccountRecoveryPage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<RecoveryState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextToken = tokenFromHash();
    setToken(nextToken);
    if (!nextToken) {
      setState({ status: "error", message: "連結不完整，請聯絡系統管理員重新產生。" });
      return;
    }
    fetch("/api/account-recovery/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: nextToken })
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message ?? "重設連結已失效。");
        setState({ status: "ready", account: body.account });
      })
      .catch((error) => setState({ status: "error", message: error instanceof Error ? error.message : "重設連結讀取失敗。" }));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setState({ status: "error", message: "兩次輸入的密碼不一致。" });
      return;
    }
    setSaving(true);
    const response = await fetch("/api/account-recovery/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setState({ status: "error", message: body.message ?? "密碼重設失敗，請聯絡系統管理員。" });
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setState({ status: "done" });
  }

  return (
    <main className="login-page">
      <section className="panel invitation-accept-panel">
        <div className="invitation-accept-heading">
          <KeyRound size={22} aria-hidden="true" />
          <div>
            <h1>重設登入密碼</h1>
            <p>此連結只能使用一次。完成後，既有登入狀態會失效。</p>
          </div>
        </div>

        {state.status === "loading" ? <div className="empty">正在讀取重設連結...</div> : null}
        {state.status === "error" ? (
          <div className="form-error" role="alert">
            {state.message}
          </div>
        ) : null}
        {state.status === "done" ? (
          <div className="invitation-account-summary">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <span>密碼已更新</span>
              <strong>請回登入頁使用新密碼登入。</strong>
              <small><Link href="/login">前往登入</Link></small>
            </div>
          </div>
        ) : null}
        {state.status === "ready" ? (
          <>
            <div className="invitation-account-summary">
              <ShieldCheck size={18} aria-hidden="true" />
              <div>
                <span>重設帳號</span>
                <strong>{state.account.displayName}</strong>
                <small>{state.account.email}</small>
              </div>
            </div>
            <form className="login-form" onSubmit={submit}>
              <label>
                新密碼
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={10} maxLength={128} required />
              </label>
              <label>
                再輸入一次
                <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" minLength={10} maxLength={128} required />
              </label>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? "更新中..." : "更新密碼"}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
