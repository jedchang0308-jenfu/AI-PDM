# DEV-088 替代料號附件人工沿用驗證計畫

Status: `Local Focused Execution PASS / QA-QC Complete / Production Migration & Release Gated`
Date: 2026-08-22
Authority: `.ai-doc/specs/SPEC-PDM-PART-ATTACHMENT-REUSE-002-replacement-selection-snapshot.md`

## 1. 風險優先序

`來源與目標不互相污染 > source stale與transaction原子性 > bytes重用與空間效率 > idempotency > company/permission > 安靜UI`。依使用者決策不建立重型反作弊／紅隊平台；一般auth/company/permission仍必驗。

本期採「穩定性／效率優先」：不做作弊／攻防型重測，不把惡意payload、暴力猜測、側通道或證據偽造平台納入完成門檻；但正常身分驗證、公司隔離、權限、冪等與舊頁籤防護仍是必要穩定性驗證。

## 2. Focused Cases

| ID | 驗證 | PASS |
|---|---|---|
| QA-088-01 | fresh SQLite／041 schema | 2 tables、FK/check/unique/index存在，重跑無差異 |
| QA-088-02 | candidate boundary | source active direct part assets完整；deleted／Drawing／Revision為0 |
| QA-088-03 | default/cancel-all | UI預設全選，可取消全部並形成0-count explicit snapshot |
| QA-088-04 | inherited snapshot | target獨立row，source row不變，storage pointer/hash相同且physical byte count不增加 |
| QA-088-05 | new file | 同submit加入target row；失敗無可見draft/file row |
| QA-088-06 | content dedupe | new優先；相同hash+size target一row，selected origins完整；同名異內容並存 |
| QA-088-07 | stale variants | source add/delete/metadata/storage pointer改變皆409且target mutation=0 |
| QA-088-08 | idempotency | same fingerprint回原snapshot；different fingerprint 409，無第二draft/asset |
| QA-088-09 | formalization | draft assets與release同transaction promotion；source不重讀、不改owner |
| QA-088-10 | release failure | owner/company/origin/asset缺件或草稿存在snapshot外active附件，使new Part、draft status、link與promotion全部rollback |
| QA-088-11 | permission/company | anonymous拒絕、cross-company不洩漏、原draft/release/attachment permission不放寬 |
| QA-088-12 | API compatibility | JSON無new file仍可用；multipart command/file mapping與stable errors正確 |
| QA-088-13 | UI quietness | 無count/badge/risk/wizard/raw token；唯一原submit |
| QA-088-14 | browser viewports | 1440×900、1024×768、390×844無overflow，keyboard/file remove可用 |
| QA-088-15 | efficiency | candidate/commit無N+1；20附件payload與DOM bounded，操作無明顯等待 |
| QA-088-16 | regression | current Part附件、Drawing受控檔、FFF/review/release、DEV-087 workbench不退步 |

## 3. Runners

- `qc:dev-088:contract`：scope、schema、route、UI banned text、Drawing non-consumer。
- `qc:dev-088:repository`：QA-088-02、04、06～10、15，使用disposable SQLite與獨立storage root。
- `qc:dev-088:http`：QA-088-05、08、11、12。
- `qc:dev-088:browser`：QA-088-03、13、14；task-owned temporary runtime必須證明port釋放。
- `qc:dev-088`：以上＋`typecheck:app`＋affected regressions＋`build:isolated`。

## 4. Stop／Release Gate

任一source被改寫、Drawing file進候選、stale仍partial commit、相同bytes被重存、release只完成Part未完成附件、cross-company存在性洩漏或UI出現第二submit即停止。Local PASS不授權041 production apply、deploy、release或physical cleanup。

## 5. Execution Result（2026-08-22）

| Runner | Result | Evidence |
|---|---|---|
| `qc:dev-088:contract` | PASS 40/40 | schema／route／UI／Drawing exclusion／scope與promotion allowlist contract |
| `qc:dev-088:repository` | PASS 29/29 | stale rollback、dedupe、idempotency、缺件／額外row release rollback；21附件=14 SQL statements |
| `qc:dev-088:http` | PASS 15/15 | JSON、multipart、replay、explicit empty、stale 409、anonymous、company boundary、port/type-entry cleanup |
| `qc:dev-088:browser` | PASS 37/37 | 1440×900、1024×768、390×844；keyboard、file add/remove、quiet UI、zero overflow/error、cleanup |
| `qc:pdm-change-control` | PASS 64/64 | 新snapshot fixture與DEV-087 canonical authority的affected regression |
| `typecheck:app` | PASS | strict app TypeScript |
| `build:isolated` | PASS | Next.js 16.3 production build，127/127 pages |
| `qc:dev-088` | PASS 7/7 | 上述單一聚合門檻 |

最新browser manifest為`output/qa/dev-088/DEV088-2026-08-21T19-49-42-331Z/manifest.json`。本機QA runtime的54435、54715及聚合時使用的62535、55168、61123、61132均已釋放；未使用或停止3000。現行warning只有Next.js既有middleware→proxy deprecation，非DEV-088 failure，後續應另案處理，不在本任務擴張。
