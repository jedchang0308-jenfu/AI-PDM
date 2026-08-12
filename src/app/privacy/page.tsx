import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import {
  PRIVACY_NOTICE_APPROVED_AT,
  PRIVACY_NOTICE_COMPANY,
  PRIVACY_NOTICE_SECTIONS,
  PRIVACY_NOTICE_TITLE,
  PRIVACY_NOTICE_VERSION
} from "@/lib/privacy-notice-content";

export default function PrivacyNoticePage() {
  return (
    <div className="privacy-page">
      <header className="privacy-page-header">
        <div className="privacy-title-row">
          <ShieldCheck size={24} aria-hidden="true" />
          <div>
            <p>{PRIVACY_NOTICE_COMPANY}</p>
            <h1>{PRIVACY_NOTICE_TITLE}</h1>
          </div>
        </div>
        <dl className="privacy-version-facts">
          <div><dt>版本</dt><dd>Pilot v{PRIVACY_NOTICE_VERSION}</dd></div>
          <div><dt>公司核准日</dt><dd>{PRIVACY_NOTICE_APPROVED_AT}</dd></div>
          <div><dt>生效日</dt><dd>Staging 開放給第一位員工之日</dd></div>
        </dl>
      </header>

      <main className="privacy-notice-body">
        <p className="privacy-notice-intro">
          本告知適用於 AI PDM 內部 Pilot 的編號建立與草稿作業。請閱讀下列資料處理方式；「我已閱讀並了解」是閱讀確認，不代表對所有處理活動作概括同意。
        </p>
        <ol className="privacy-notice-list">
          {PRIVACY_NOTICE_SECTIONS.map((section) => (
            <li key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </li>
          ))}
        </ol>
        <section className="privacy-contact-section" aria-labelledby="privacy-contact-title">
          <h2 id="privacy-contact-title">聯絡窗口</h2>
          <p>主要窗口：<a href="mailto:jedchang0308@jenfu.com.tw">jedchang0308@jenfu.com.tw</a></p>
          <p>備援窗口：<a href="mailto:dani@jenfu.com.tw">dani@jenfu.com.tw</a></p>
        </section>
        <Link className="secondary-button privacy-back-link" href="/login">
          <ArrowLeft size={16} aria-hidden="true" />
          返回登入
        </Link>
      </main>
    </div>
  );
}
