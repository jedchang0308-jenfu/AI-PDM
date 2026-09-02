# QC DEV-107 — Local Completion Receipt

Status：`PASS / Local QA-QC Complete 38/38 / Production Release Gated`

Date：2026-08-31

## 1. Evidence

- Aggregate manifest：`output/qa/dev-107/DEV107-aggregate-2026-08-31T06-54-27-649Z/manifest.json`
- Command：`npm.cmd run qc:dev-107`（aggregate＋`typecheck:app`）
- Additional gates：affected-file ESLint、`npm.cmd run build:isolated`、`npm.cmd run qc:doc-paths`

## 2. Fixed denominator

`QA-107-001..038` exact union，38 cases，duplicate=0，PASS=38，FAIL／BLOCKED／NOT RUN=0。

| Runner | Cases | Result |
|---|---:|---|
| Contract／state | 001..008 | PASS 8/8 |
| SQLite repository／service | 009..019、021..026、033..035、037..038 | PASS 22/22 |
| Disposable PostgreSQL | 020 | PASS 1/1 |
| Migration parity | 036 | PASS 1/1 |
| Real Chromium browser | 027..032 | PASS 6/6 |

## 3. Integrity and cleanup gates

- `productionConnection=false`、`primaryWrites=false`。
- Primary SQLite schema、canonical root／Part／Drawing identity、master counts、migration residue、root refs、`PRAGMA foreign_key_check`與source fingerprint前後不變。
- SQLite／browser使用task-owned `PDM_DATA_DIR`／`PDM_REPOSITORY_DIR`；PostgreSQL使用disposable cluster；browser動態port、Next process、PG cluster、temp與runtime dist皆於manifest前停止／移除。
- `typecheck:app`、affected ESLint、isolated Next build與documentation path QC均PASS；isolated build再次證明primary database invariant未變。

## 4. Defects found and closed

1. Cancelled amendment不可成為current leaf或重用原dedup key；保留歷史後允許新的受控編輯嘗試。
2. Amendment source讀取必須沿`evidence_origin_session_id`回到原始session；不得複製raw source／adapter／observation，也不得因來源錯誤回404。

修正後重新執行aggregate仍為38/38 PASS。

## 5. Parent baseline disposition

DEV-068／079 contract回歸PASS。DEV-068 A0005、DEV-079 layout、DEV-083 mutation與DEV-101 package的歷史資料相依runner因來源fixture不存在或已漂移而fail-closed；各runner未寫入primary且已清理task-owned資料／process。這些是parent fixture維護事項，不併入DEV-107固定分母，不得手工改寫成PASS；各parent owner補齊fixture後另行重跑。

## 6. Boundary

本收據只代表local implementation與local QA/QC完成，不授權primary data repair、正式migration apply、activation、staging／production deploy、release或真人canary。
