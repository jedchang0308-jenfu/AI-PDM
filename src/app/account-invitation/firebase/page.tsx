"use client";

import { useEffect, useState } from "react";
import { UserRoundCheck } from "lucide-react";
import type { FirebaseWebConfig } from "@/lib/auth-config";
import {
  completeFirebaseEmailLinkInvitation,
  exchangeFirebaseBffSession,
  firebaseLoginErrorMessage
} from "@/lib/firebase-client-auth";
import {
  PRIVACY_NOTICE_ACKNOWLEDGEMENT_LABEL,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION
} from "@/lib/privacy-notice-content";

export default function FirebaseAccountInvitationPage() {
  const [config, setConfig] = useState<FirebaseWebConfig | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/mode")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { authMode?: string; firebase?: { config?: FirebaseWebConfig | null } } | null) => {
        if (body?.authMode !== "firebase_bff" || !body.firebase?.config) throw new Error("FIREBASE_NOT_CONFIGURED");
        setConfig(body.firebase.config);
      })
      .catch(() => setError("Firebase 帳號啟用尚未完成系統設定。"));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!config) return;
    if (password.length < 10 || !/[A-Za-z]/u.test(password) || !/[0-9]/u.test(password)) {
      setError("密碼需至少 10 個字元，並包含英文字母與數字。");
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致。");
      return;
    }

    setLoading(true);
    try {
      const result = await completeFirebaseEmailLinkInvitation(config, email, password, window.location.href);
      const exchange = await exchangeFirebaseBffSession(result.user, result.auth, {
        privacyAcknowledged,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        privacyRequestId: crypto.randomUUID(),
        returnTo: "/"
      });
      window.location.href = exchange.kind === "privacy_ack_required" ? exchange.acknowledgementUrl : "/";
    } catch (firebaseError) {
      setError(firebaseLoginErrorMessage(firebaseError));
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-heading is-managed">
          <h1>啟用 AI PDM 帳號</h1>
          <p>完成公司電子郵件確認並設定登入密碼。</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <div className="privacy-activation-summary" aria-label="個人資料告知摘要">
            {PRIVACY_NOTICE_SUMMARY.map((item) => <p key={item}>{item}</p>)}
            <a href="/privacy" target="_blank" rel="noreferrer">查看完整告知</a>
          </div>
          <label>
            受邀電子郵件
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </label>
          <label>
            設定密碼
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" required />
          </label>
          <label>
            確認密碼
            <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required />
          </label>
          <label className="privacy-acknowledgement-control">
            <input
              checked={privacyAcknowledged}
              onChange={(event) => setPrivacyAcknowledged(event.target.checked)}
              type="checkbox"
            />
            <span>{PRIVACY_NOTICE_ACKNOWLEDGEMENT_LABEL}</span>
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <button className="primary-button" disabled={loading || !config || !privacyAcknowledged} type="submit">
            <UserRoundCheck size={16} aria-hidden="true" />
            {loading ? "啟用中..." : "啟用帳號"}
          </button>
        </form>
      </section>
    </div>
  );
}
