"use client";

import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";

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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
        <div>
          <h1>AI PDM 登入</h1>
          <p>請使用測試帳號登入，依角色權限檢視送審、審核、設定與 AI 助手功能。</p>
        </div>

        <div className="test-account-card" aria-label="測試帳號">
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
                  href={`/login?account=${encodeURIComponent(account.role)}`}
                  role="button"
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
        </div>

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
