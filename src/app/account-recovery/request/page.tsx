"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";

export default function AccountRecoveryRequestPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/account-recovery/handoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(body.message ?? "帳號復原要求無法送出。");
      return;
    }
    setMessage(body.message ?? "如果帳號符合復原條件，系統會寄出復原郵件。");
  }

  return (
    <div className="login-page">
      <section className="login-panel account-recovery-request-panel">
        <div className="login-heading is-managed">
          <h1>帳號復原</h1>
          <p>輸入公司電子郵件後，系統會使用供應商管理的復原郵件處理。</p>
        </div>

        {message ? (
          <div className="account-console-message is-success" role="status">
            <MailCheck size={16} aria-hidden="true" />
            {message}
          </div>
        ) : null}

        <form className="login-form" onSubmit={submit}>
          <label>
            公司電子郵件
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="primary-button" disabled={loading || !email.trim()} type="submit">
            <KeyRound size={16} aria-hidden="true" />
            {loading ? "處理中..." : "寄送復原郵件"}
          </button>
        </form>

        <div className="login-help-footer">
          <Link href="/login">返回登入</Link>
        </div>
      </section>
    </div>
  );
}
