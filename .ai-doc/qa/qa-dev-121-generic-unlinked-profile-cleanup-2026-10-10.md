# DEV-121 generic unlinked-profile cleanup — local validation

沿用 [DEV-121 current contract](../specs/DEV-121-target-authorization-boundary.md#unlinked-profile-cleanup)。本文件只記錄通用設計與本地合成驗證；實際 Production 操作輸入、帳戶資料、snapshot、provider 原始讀回與完整執行證據私下保存，不提交 Git／PR／公開 CI。

| 驗證層 | 結果 | 證明範圍 |
| --- | --- | --- |
| task-owned disposable PostgreSQL | 72/72 PASS | 安裝零 DELETE、單筆 snapshot/delete、重試／並行、晚期回滾、權限／引用／schema／receipt 拒絕；合成 supporting fixtures，不宣稱完整 Production schema |
| required continuous unit regression | 200/200 PASS | producer／runner／owner source binding、private generation/hash、拒絕與防重送；memory driver 不替代 native PostgreSQL |
| actual owner transport synthetic regression | 10/10 PASS | BASE／BOUND 正向、pre-migration build-only／無 migrate read、coherent binding 拒絕及 generic unbound receipt 拒絕；provider verification 未執行 |
| six release-adapter gates | PASS | continuous、owner QC、abort、staged DB boundary、app typecheck、isolated build；LOCAL_CONTRACT，無 release authority |
| authentic historical owner proof replay | 183/183 PASS | 私下封存且雜湊鎖定的歷史 provider/source closure；包含 cleanup observer 回歸，無當前 Production 呼叫。僅尾端空行及相應 084 hash pins 後續機械整理；final PostgreSQL 72/72、continuous 200/200、affected cleanup/authentic observer 37/37 重新通過，其他未變行為按層級沿用 |
| current Production operation | NOT_RUN | protected source／required CI／image rotation／private binding／native readback 另驗 |

獨立 Codex QC 完整讀閱 generic SQL／runner／producer／stage／proof 與新增測試。已閉合的兩項缺口：合法 BOUND manifest 必須進入 AI-PDM 專用證據圖且 generic v1 拒絕 self-bound receipt；prepare／build／migrate 在 provider 效果前完整重算 BASE／BOUND、source lock 與私有 ref。修正後無未解決 P0／P1。新增 source 的 privacy review 未見實際 target、人員、Principal、個人 Email、Production payload 或私有 evidence path。

084 僅安裝 generic migrator-only INVOKER capability；無 private binding 的執行不刪資料。首次 operation 與 ledger 在同一 transaction；已套用後 replay 使用既有 advisory lane。固定 snapshot/row guard、引用拒絕與未知結果 readback 保持 fail closed。runner executable inputs 改變須 own image rotation，不能使用假 app-infra reuse；本次 Production 操作限定 native migration-only workflow 的唯一 capsule，僅 prepare→build→migrate，無 target／SQL override，不執行 app traffic stage；既有 full owner workflow 的產品能力不變。

PostgreSQL 程序／連接埠／暫存資料已清理；isolated build artifact、primary invariant 與 own temp cleanup 均 PASS。公開 branch 自現行 main 建立，原私有清理包歷史不帶入。任何 Production 結論只由 private native operation/audit/ledger/absence readback 支持，歷史資料清理不能替代本人正常 SSO 驗證。
