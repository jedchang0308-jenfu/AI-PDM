# DEV-106 Local Release Readiness Receipt

日期：2026-08-30

Release boundary：`codex/dev-106-retired-residue-cleanup`，由 production source `3b9d74bfa97b407c248e37077dc75f5bf1d5fe69` 建立

判定：`Local Pre-release PASS / Cloud Release Gates Pending`

## 固定分母

QA-106-001..013：`13/13 PASS`。QA-106-014..016 必須以 exact merged source 與 immutable artifact 在 Cloud release lane 執行，不以本地模擬代替。

## 證據

| 範圍 | 結果 |
|---|---|
| DEV-106 SQLite/schema/negative retirement | `25/25 PASS` |
| DEV-106 isolated PostgreSQL retirement | provider `9/9 PASS`；DEV-106 `8/8 PASS` |
| Migration package | `13/13 PASS`；ordered migration count=`50`；last=`052` |
| Production deployment pipeline contract | `23/23 PASS` |
| DEV-087 current contract | `41 PASS`；未恢復退役 positive flow |
| DEV-090 retirement | `10/10 PASS` |
| DEV-095 BOM retirement | `20/20 PASS` |
| DEV-090／DEV-100 compatibility | `25/25 PASS`；`8/8 PASS` |
| TypeScript | `typecheck:app PASS` |
| Isolated production build | `PASS`；114 static pages；primary DB absent/unchanged；task-owned runtime cleaned |

## 資料與安全判定

- 非空 Relation current data 會使 migration 052 整筆 rollback；空 table 才能移除。
- `bomUsagePolicy` 只從 Part work JSON 移除，並由 PostgreSQL constraint 與 SQLite trigger 阻止回流。
- `drawing_part_links`、root/part/drawing identities、work identities與歷史 snapshot/trace 不在刪除範圍。
- recovery mapper 不再直接重播 historical migration 042，且未見 migration 052 時 fail closed。
- Restore readback發現DEV-087 recovery建立的provisional master與其active candidate共用號碼；DEV-032 oracle改以`Draft`＋reservation-derived master ID精確配對，不把合法provisional identity誤判為正式號碼重用，其他collision維持fail closed。
- isolated PostgreSQL runtime使用 task-owned port `55439`；完成後 port 已釋放且 temporary roots=`0`。

## 待完成 Cloud gates

- QA-106-014：production fresh backup → 獨立 restore target → exact migration runner兩次 → read-only reconciliation → target刪除。
- QA-106-015：exact app artifact部署0% candidate，執行 basic/authenticated read smoke。
- QA-106-016：production migration與read-only reconciliation；traffic activation須在candidate evidence後取得獨立決策，再做canonical smoke。
