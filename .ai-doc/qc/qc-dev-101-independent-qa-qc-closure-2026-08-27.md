# DEV-101 Independent QA/QC Closure Receipt

Status：`Local QA/QC Completion Candidate / 48 of 48 PASS / Production Release Gated`

PM disposition：上述completion candidate已依固定分母、獨立runner與零開放P0／P1證據接受為
`Local RD Implemented / Independent QA-QC Complete`；此接受只關閉本機交付點，不提升production狀態。

Date：2026-08-27

## 1. 結論

DEV-101 固定分母`QA-101-001..048`已由四個獨立runner在同一parent run與同一source fingerprint下完成：48 PASS、0 FAIL、0 BLOCKED、0 NOT_RUN。此結論是本機完成候選，不代表已部署、已啟用production writer或已完成production effectiveness monitoring。

- Aggregate：`output/qa/dev-101-independent-aggregate/DEV101-INDEPENDENT-AGGREGATE-2026-08-27T15-19-16-555Z/manifest.json`
- Aggregate SHA-256：`d46ae8f573ceba15569751b51a46a27de52c787a027d944a14fad5cd7e10e481`
- Result：`PASS`
- Completion candidate：`true`
- Source：HEAD `818db82ad9f47e938be15c3ded21ff88f7e3ea07`，branch `持續優化2`，dirty-boundary hash before/after皆為`15a6299a4356b95cc78eddfc9064bf1d2c68410f507436d7135667c9ab4430f4`
- Primary SQLite fingerprint before/after：`f865991398be498c5525641e0459861dc9f3908b49acfff0fb041a228b387326`，foreign-key violations=0
- Re-qualification reason：23:16 `package.json`因其他DEV的script registry更新而改變整體source boundary；產品碼未以推論豁免，仍對新boundary重跑固定48案。先前`DEV101-INDEPENDENT-AGGREGATE-2026-08-27T14-02-52-781Z`保留為historical supporting evidence，不再是current-source closure。

## 2. Child manifests

| Runner | 固定case覆蓋 | Result | Manifest SHA-256 |
|---|---:|---|---|
| `qc-dev-101-independent-data` | 29 | PASS | `4b4fea82b8d4844851a0a0c9ac24ccc9928e883b2e5b7a650167fab8440219ac` |
| `qc-dev-101-independent-browser` | 23 | PASS | `b95b20a11c705ad1cfd2364c05311b4f2a5378e908cf41a4a221399047eaa51c` |
| `qc-dev-101-independent-postgres` | 2 | PASS | `aa0ee9d55ed4030a099610f82a57a4e53d3ca05653fd0408bd60678b324862a3` |
| `qc-dev-101-independent-gate` | 5 | PASS | `3a6e8f03a3bbf1be0bddc55b19a2866ccc608d1e42f24c3b3e6deb0f03b3fa28` |

重疊case依registry要求所有required runners均PASS才算aggregate PASS，不以四個runner的case數相加灌水。

## 3. 核心產品事實

1. Independent QA執行時，A0002-M01的primary資料仍有assigned pending review；SQLite與PostgreSQL exact reviewer inbox projection均能以圖號、revision與PDM action辨識該列。Primary reconciliation完成後，該request於2026-08-27 15:32經正常業務流程terminalize並留下`pdm_work_review_terminal_receipts`與`pdm_review_traces`；產品修正沒有重建、backfill或更改A0002-M01 snapshot。
2. 審核者由`/approvals`正常入口可發現v1與v2 request，點列進入`/approvals/[requestId]`；v2同頁以關聯矩陣切換Drawing／Part target，並以owner editor相同domain renderer顯示immutable snapshot。
3. 審核工作頁可同時取得圖號、料號、關聯矩陣、submitted/change/risk marker、附件、送審時辨識projection與request-level decision；只讀capability由server控制，審核者不能把live資料自行混入decision basis。
4. v1 writer flag off與v2 writer flag on均有actual runtime readback與正常UI新建request證據；既有v1保持v1，不回填成v2。
5. recognition projection具獨立inner hash、exact revision/session lineage與受控Part owner resolution；invalid／unresolved／ambiguous owner在approve前fail closed，return仍可用。

## 4. Rendered browser evidence

- Browser cases：23/23 PASS。
- Runtime ports：v1=`53455`、v2=`51901`，均已釋放；exact Next child trees停止，task temp移除。
- Viewports：1440×900、1024×768、768×1024、390×844、200% equivalent。
- Visible error hard gate：console errors=0、page errors=0、unexpected request failures=0、visible errors=0。
- Raw request failures=7，皆為navigation-aborted requests，已由ledger分類，不被隱藏成unexpected error。
- Screenshot與DOM／network／accessibility／focus／geometry hashes位於browser child目錄。

## 5. Provider、build與anti-false-PASS

- PostgreSQL：實際`postgres (PostgreSQL) 18.4`；task port `56067`已釋放，cluster temp移除。
- PostgreSQL full schema restore、A0002-M01 inbox、filter-before-limit、125+ row cursor、v2 immutable package、attachment drift、projection inner hash與concurrent approve exactly-one effect均PASS。
- Isolated Next build：exit 0、artifact ready、120/120 static pages、primary invariant unchanged，runtime project已移除。
- Typecheck與affected ESLint：exit 0。
- QA evidence integrity：16/16 mutants PASS，fixed-case claims=0。
- Missing inbox adapter mutant：normal entry被偵測為失敗、direct detail仍可開但不能算入口PASS、aggregate `QA-101-042=FAIL`；恢復adapter後同source aggregate PASS。
- 一次pre-closure run曾因DEV-101 SPEC在gate執行中被外部流程修改而`sourceUnchanged=false`，`QA-101-036`與aggregate正確FAIL；未沿用該證據。最終receipt以修改後穩定source重跑。

## 6. CAPA判定

- Approval inbox discoverability CAPA：`Local Effectiveness Verified`。
- DEV-101 recognition owner/review parity的CA-5／CA-6：`Local Effectiveness Verified`。
- 跨DEV recognition CAPA：單一resolver、accepted-state command／DB invariant、explicit reconciliation與GET zero-write已完成隔離SQLite／PostgreSQL驗證；primary schema guard與21筆exactly-one reconciliation亦已依授權完成，狀態為`Local Effectiveness Verified / Primary Reconciliation Verified / Production Effectiveness Pending`。
- Production：未deploy、未stage、未啟用production flag；CAPA release branch已建立，但與`origin/main`的分歧需獨立整合與全量回歸，仍需deployment/release gate、正式授權與release後監測。

## 7. Primary apply 與 release-source readiness

- 最新primary inventory：`output/qa/dev-079-reconciliation/DEV079-RECON-2026-08-27T14-23-22-332Z/manifest.json`。
- 最新primary dry-run：`output/qa/dev-079-reconciliation/DEV079-RECON-2026-08-27T14-23-23-171Z/manifest.json`。
- 兩份plan hash皆為`5094696b0f96c9450d185c9b7adb5be874db1badc41c9d9a6227d83b4c738c9f`；19 valid、21 `repairable_exactly_one`、applied=0，target fingerprint前後皆為`7faaccbd739030f74d0f1c0767e7fb8753fc0b9c29415db354557f58fde81fce`。
- 人類於2026-08-27明確授權primary DEV-079 schema guard與21筆reconciliation，並要求fingerprint不符即停止。正式執行收據：`output/qa/dev-079-primary-apply/DEV079-PRIMARY-CAPA-2026-08-27T15-18-30-550Z/receipt.json`；一致性備份SHA-256=`f7515d74c510a94f7e8d4fc312af794cd2d89e6c464e73a1c067bd6f7aa35279`。
- Apply精確結果：21筆更新；同idempotency key重跑0筆；最終inventory=`valid:40`、repair plan=0。Review fingerprint保持`09e33009254cc412df49c989a426e4e8181eefb2eb2b066c56c2160b2860c66f`；canonical roots／parts／drawings數量維持59／59／53，broken root reference=0，migration residue不變，`PRAGMA foreign_key_check`=0。
- `npm run qc:production-deployment-pipeline` fresh結果為21/21 PASS；migration 051、zero-traffic candidate、candidate-bound Level 4／Wave 0、separate promotion、traffic-only rollback及workflow source classification均有contract gate。
- SQLite schema apply要求candidate fingerprint與review-request snapshot fingerprint；reconciliation apply再強制candidate fingerprint、review fingerprint、plan hash與expected repair count，錯誤指紋在transaction前零寫入失敗。補強後fresh isolated SQLite report=`output/qa/dev-079-owner-invariant/DEV079-INVARIANT-2026-08-27T15-16-34-617Z/report.json`，PostgreSQL report=`output/qa/dev-079-owner-invariant-postgres/DEV079-PG-2026-08-27T15-17-26-310Z/report.json`，均PASS。
- 最新只讀release-source分類：60,162 dirty entries中301為included production source、59,860為generated evidence、1為staging-only、unknown risk=0；source snapshot=`e1bfeb4546351d6fde03deecb0f27b2e1f7713ef4bc55d48f180bdadb75df89e`。
- Release source採`codex/dev-079-dev-101-capa-release`獨立worktree與受控檔案邊界，verified base=`818db82ad9f47e938be15c3ded21ff88f7e3ea07`。嘗試直接合併`origin/main@16d3ffaccb61df6cabd63b615266a72bccfae17b`時出現大量與本CAPA無關的BOM retirement／DEV-087衝突，已安全abort；因此branch可作乾淨CAPA source，但在獨立整合與全量回歸完成前不得部署或切traffic。

## 8. 已知非阻斷技術債

1. Next.js提示middleware convention deprecated，應另案遷移至proxy convention。
2. `pg`提示同一client執行併發query的呼叫模式將在pg 9移除；目前concurrency結果與資料一致性PASS，應另案調整為外部flow control或獨立client。
3. Node experimental loader／transform-types提示屬test runner工具鏈，未造成case或build失敗。
