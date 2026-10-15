# DEV-122 B53：RD 帳號圖號工作台權限獨立切片（本機）

狀態：`LOCAL_RD_PERMISSION_PASS / REQUIRED_CI_PENDING / PRODUCTION_NOT_RUN`。本文件只涵蓋 DEV-122 優先項目 2；不改變 7 issues／29 groups 分母，也不將 DEV-122 整體標為 PASS。

## 最小充分因果模型

### 已證實事實

- `config/access-control/jenfu-role-catalog.v7.json` 的 `rd` 角色允許 `page:numbering.drawings.view` 與既有 create／update／submit action，未允許 `approval.request.decide`；catalog SHA-256 為 `4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9`。
- `085_dev121_principal_role_catalog_v7.sql` 是 v6→v7 的 forward-only publication，具 exact version/hash/order/replay/tamper/atomic guards；本切片沒有修改 migration。
- Principal request guard 先驗 token／issuer／audience／session／auth epoch／active account／profile／company，再於同一交易取得 active catalog 與 effective grant；workbench API 與 permissions API 共用 Principal evaluator，UI 的 `/numbering/drawings` 入口消費同一 capability vector。
- 歷史 RED 可在相同有效 RD assignment 配 v6 catalog 時重現 `permission_not_granted`；v7 publication 下，新的 native PostgreSQL exact selector 1/1 通過：RD permissions GET 200、實際圖號資料可列出、既有 submit 成功；同一 RD 的 approval POST 403 且 lifecycle snapshot 零變更；QA 圖號列表 GET 403 且 snapshot 零變更。
- `output/qa/dev-122/rd-permission-repair/manifest.json` 記錄 `LOCAL_RD_PERMISSION_PASS`、`executedCases=1`、`firstFailure=null`，以及 children／PostgreSQL／ports／temp 全數清理。這是隔離 fixture 證據，不是正式 actor 或正式資料庫證據。
- current35 與 historical closed34 fixture 已有精確分流；本輪 fresh contract test 確認 current35 不會借用 B35 closed34 policy。

### 推論

- 若正式 active catalog 仍是 v6 或未發布精確 v7，RD 圖號工作台會在共同 catalog／permission 邊界失敗；不應在 UI、API 或 migration 各自加例外。
- 若正式 v7 已 active，下一個需讀回的邊界是實際 RD actor 的 active grant；若 grant 正確，再檢查 session/token 的 issuer、audience、auth_time 與 revokedBefore。`auth_token_invalid` 不能當成 RD capability 缺失證據。

### 假設

- 真實使用者應以穩定 `rd` role ID、`workspace` scope 與目前公司取得 effective grant；grant 的 catalogVersion 是來源追溯，不要求與 active catalog 強制相等。

### 未知

- 正式資料庫是否已套用 085、active catalog 的實際 version/hash、真實 RD actor 的 active grant，以及目前 session/token 是否有效。
- 正式 UI/API 的實際正向與核准／未授權負向結果。上述項目未經 provider readback 與真實帳號驗證前，不宣稱正式 PASS。

## 本次最小變更

- 新增 `qc:dev-122:rd-permission-repair`，只選中一個 lifecycle native case。
- runner 對 selector、suite、唯一案例名稱與 PASS cardinality fail closed，並僅對該獨立切片回傳 `LOCAL_RD_PERMISSION_PASS`；其餘 DEV-122 selector 與整體 `PARTIAL_NOT_ACCEPTED` 語意不變。
- native test 以同一 signed RD Principal 貫穿 catalog、grant、permissions、實際 drawing workbench data 與 submit，再以實際 route 驗 approval deny；QA 使用另一 signed Principal 驗圖號列表 deny。兩個拒絕都比對精確 error 與前後 snapshot。
- 沒有修改產品授權程式、catalog、085、OrgMaster／Platform、正式資料或 release adapter。

## 驗證與原始失敗保存

- 專用 native PostgreSQL：1/1 PASS；固定證據 `output/qa/dev-122/rd-permission-repair/`。
- 既有 v7 catalog／migration QC：7/7 PASS；catalog builder 3/3 PASS。
- 受影響 Principal／workbench／permission tests：12 files、70/70 PASS。
- `npm run check:db-boundary`：PASS（22 governed files）。
- route classification：266 routes／305 methods，PASS。
- current35/closed34 fixture contract：1/1 PASS。
- 最後位元組 `npm run typecheck:app` 與 `npm run build:isolated`：PASS；isolated build 的 artifact／primary database-absent invariant／cleanup 均為 true。
- 原始 runner 嘗試依序保留於 `output/qa/dev-122/dfb7e0c647d91dad/`、`ef968469f6a36b73/`、`35e7191c24194640/`、`49f7c9425c08664e/`、`ce9169ec8fa113bb/`、`7d7363538b997f63/`；中間 PASS `5ab458cdca8323ff` 亦保留。最終 source-bound PASS 為 `eb2a86904f971504`，並複製至固定目錄；不以最後成功覆寫前述 selector／allowlist／evidence expectation／governor／exact-name 失敗。

## 發布與責任邊界

- 若 provider readback 證明 085 未套用，必須走正常 app-owned full35 migration release；program-only／closed34／prefix33 不符合本切片需求。
- 若 085 已套用，不修改 085；只有在 active publication 本身錯誤時，才於確認下一個本地 migration ID 後建立 forward-only corrective migration。
- 若問題是 actor grant，寫入責任屬 OrgMaster assignment producer；若問題是 session/token，責任屬 Platform/session exchange。兩者本輪都只有 read-only 查證權，沒有修改權。
- 正式 migration、deploy、traffic、rollback、IAM、Secret、worker、Scheduler 與手動正式資料修改皆 `NOT_RUN`。
