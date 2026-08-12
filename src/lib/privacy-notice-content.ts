export const PRIVACY_NOTICE_VERSION = "1.0";
export const PRIVACY_NOTICE_TITLE = "AI PDM 員工個人資料告知事項";
export const PRIVACY_NOTICE_COMPANY = "鉦富機械有限公司";
export const PRIVACY_NOTICE_APPROVED_AT = "2026-07-13";

export const PRIVACY_NOTICE_SUMMARY = [
  "AI PDM 會處理帳號、權限、登入安全與編號建立／草稿操作所需資料。",
  "正式業務資料預定存放於 Google Cloud 台灣 asia-east1。",
  "Firebase Authentication 身分資料可能由 Google 在美國或其服務地區處理。"
] as const;

export const PRIVACY_NOTICE_SECTIONS = [
  {
    title: "蒐集者",
    body: "鉦富機械有限公司。"
  },
  {
    title: "蒐集目的",
    body: "建立與驗證 AI PDM 帳號、執行權限控管與多因素驗證、提供編號建立及草稿作業、維護資安與系統穩定、追查異常操作、履行內部管理及法令義務。"
  },
  {
    title: "個人資料類別",
    body: "姓名或顯示名稱、公司電子郵件、員工工號／登入別名、Firebase 身分識別碼與登入方式、帳號／角色／權限／在離職狀態、MFA 狀態、登入與 session 安全紀錄、領號／草稿／管理操作及稽核識別資料。工號只用於尋找受管理帳號及 PDM User ID 映射，不是密碼或授權依據。系統不保存使用者密碼、MFA secret、復原碼，也不在一般應用程式 log 記錄密碼、驗證碼、session token 或完整工作內容 payload。"
  },
  {
    title: "利用期間",
    body: "離職時立即停用帳號，Firebase identity 原則上於離職後 30 日刪除；邀請、復原及 session 安全事件保存 180 日；應用程式安全 log 保存 365 日；Google _Required 系統 log 依供應商固定政策保存 400 日。圖號與防止重複使用所需的最小台帳永久保存；已關閉或取消的草稿保存 3 年；操作稽核保存 3 年並以穩定 PDM User ID 識別；已退役工號／登入別名保存 3 年後移除原始別名。具名、具理由及到期日的法律或資安保全要求得暫緩刪除。"
  },
  {
    title: "利用地區",
    body: "正式業務資料預定存放於 Google Cloud 台灣 asia-east1；Firebase Authentication 身分資料可能由 Google 在美國或其服務地區處理；Google Cloud 系統必要 log 可能位於全球服務位置；Google Workspace 核准副本依 Workspace 服務位置處理。"
  },
  {
    title: "利用對象",
    body: "公司內經授權的管理、資訊、稽核及業務必要人員；受公司委託提供身分、雲端、監控或支援服務的 Google／Firebase；依法有權要求提供之主管機關或司法機關。不得用於未告知的行銷、員工績效自動評分或與本系統目的無關的監控。"
  },
  {
    title: "利用方式",
    body: "透過帳號登入、權限檢查、系統交易、稽核紀錄、備份、異常調查及必要人工查核處理。所有商業邏輯只經可移植 HTTP/BFF；Firebase 的資料庫、檔案儲存、雲端函式、可呼叫函式與資料庫觸發流程不作正式資料權威。"
  },
  {
    title: "當事人權利",
    body: "可聯絡 jedchang0308@jenfu.com.tw 請求查詢或閱覽、製給複製本、補充或更正、停止蒐集／處理／利用或刪除；dani@jenfu.com.tw 為備援窗口。公司得依適用法令、保存義務與業務必要性回覆。"
  },
  {
    title: "不提供的影響",
    body: "必要帳號與安全資料若不提供，將無法啟用或繼續使用 AI PDM；非必要欄位不得成為使用條件。"
  },
  {
    title: "版本與變更",
    body: "本版為 Pilot v1.0，生效日為 staging 開放給第一位員工之日，實際日期由系統在發布時記錄並顯示。涉及目的、資料類別、跨境處理或保存期間的重大變更，使用者下次進入時須重新閱讀確認。"
  }
] as const;

export const PRIVACY_NOTICE_ACKNOWLEDGEMENT_LABEL =
  `我已閱讀並了解 ${PRIVACY_NOTICE_TITLE}（版本 ${PRIVACY_NOTICE_VERSION}）`;

export function privacyNoticeCanonicalJson() {
  return JSON.stringify({
    version: PRIVACY_NOTICE_VERSION,
    title: PRIVACY_NOTICE_TITLE,
    company: PRIVACY_NOTICE_COMPANY,
    sections: PRIVACY_NOTICE_SECTIONS
  });
}
