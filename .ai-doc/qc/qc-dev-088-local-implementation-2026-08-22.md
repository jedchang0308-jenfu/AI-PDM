# QC-DEV-088：替代料號附件人工沿用本機實作報告

Status: `PASS / Local RD-QA-QC Complete / Production Migration & Release Gated`
Date: 2026-08-22
DEV: `DEV-088`
Authority: `.ai-doc/specs/SPEC-PDM-PART-ATTACHMENT-REUSE-002-replacement-selection-snapshot.md`

## 結論

DEV-088本機範圍通過。使用者建立替代料號時可看到來源formal Part目前有效直接附件，預設全選並可取消任一／全部；新檔在同一扁平區與同一提交加入。Drawing、Drawing Revision、`drawing_2d`與`cad_3d`不會進入候選。

後端以一次性snapshot建立target自己的`file_assets` rows，共享來源immutable storage pointer，不搬移來源owner、不複製physical bytes、不建立後續同步。source token stale時整案零mutation；同內容dedupe、冪等重送與approval owner promotion皆以transaction fail closed。

## 驗證結果

| Gate | Result |
|---|---|
| Contract | 40/40 PASS |
| Repository／atomicity／efficiency | 29/29 PASS；含snapshot外row阻擋，21附件建立=14 SQL statements |
| HTTP | 15/15 PASS；JSON、multipart、replay、empty selection、stale、auth/company、runtime/type-entry cleanup |
| Authenticated browser | 37/37 PASS；1440×900、1024×768、390×844，zero overflow／console／network error |
| Affected change-control regression | 64/64 PASS |
| TypeScript | PASS |
| Next.js isolated production build | PASS；127/127 pages |
| Aggregate `npm run qc:dev-088` | 7/7 PASS |

最新browser manifest：`output/qa/dev-088/DEV088-2026-08-21T19-49-42-331Z/manifest.json`。聚合與補強重跑使用的62535、55168、54435、54715、61123、61132均已釋放；tracked `next-env.d.ts`在runner後hash一致，使用者的3000環境未被停止或修改。

## QA主管判定

- 穩定性：PASS。source stale、response replay、promotion缺件、company mismatch皆不會產生partial visible state。
- 效率：PASS。candidate單次query，asset與origin batch insert；未發現逐檔N+1或bytes倍增。
- UI：PASS。單一平面區、預設全選、keyboard與新檔移除可用；沒有件數、badge、risk card、raw token或第二submit。
- 權限：PASS於本期正常邊界。anonymous／cross-company拒絕且沿用既有permission；依使用者決策未擴張作弊／攻防型紅隊平台。
- 回歸：PASS。舊`qc:pdm-change-control`已改用DEV-087 canonical mutation authority與DEV-088合法replacement fixture，未放寬新契約。

Next.js輸出既有`middleware`→`proxy` deprecation warning；本輪沒有因此失敗，也不在DEV-088擴張處理。

## 未授權／未完成

本報告不授權Cloud SQL migration 041 production apply、正式資料搬移、deploy、release、production smoke、正式storage provider pointer驗證或physical orphan GC。DEV-087 migration 042仍必須可在041不存在時獨立套用。DEV-088目前未建立commit。
