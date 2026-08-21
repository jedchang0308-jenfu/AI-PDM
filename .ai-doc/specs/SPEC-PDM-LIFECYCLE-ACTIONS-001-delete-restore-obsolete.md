# SPEC-PDM-LIFECYCLE-ACTIONS-001：資料刪除、還原與作廢簡化架構

> 2026-08-22 DEV-087 Amendment（RD Implementation Ready）：Drawing open idle branch 的 latest approved RD 可執行次要風險動作 `申請作廢`。送審時不建立新 revision；退回後恢復 idle open；核准並 system formalize 後關閉整個 branch、移出 current list、釋放一個 branch-cap slot，且不得 reopen。branch 內已核准 identity、minimal review trace 與 controlled artifact 保留供追溯。未核准 physical bytes 僅在零有效引用且 canonical-only gate 通過後永久刪除，DEV-087 不提供備份回復、使用者恢復或 UI 復原入口；DB/schema/binding migration backup／rollback 仍須保留。若舊 restore／obsolete／current-row action與本 amendment 衝突，以 DEV-087 新決策為主；可安全拆除的舊 current-state action、command與fallback在同一DEV移除，不保留雙軌相容。
>
> 2026-08-18 DEV-077 Amendment：已配置 official root／drawing／part number 的 Draft／NeedInfo bundle 不再走一般可還原 `刪除`。符合 zero-controlled-reference gate 時走免正式審核的 `作廢草稿編號 → Obsolete`，永久不回收並進受控歷史；Active／Released 或需正式責任鏈者仍走 `申請作廢 → approval → Obsolete`。本 amendment 對 DEV-077 scope 優先於本文件舊條款。

狀態：Accepted / Phase 1-6 authorized / RD in progress
日期：2026-06-30
關聯 DEV：`DEV-PDM-LIFECYCLE-ACTIONS-001`
關聯 ADR：`.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`
關聯 implementation contract：`.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md`
關聯 QA：`.ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md`
適用系統：AI_PDM
節點類型：交付點

## 1. 目的

建立全系統一致的資料生命週期操作架構，讓使用者在前端只需要理解三個主操作：

- `刪除`
- `還原`
- `申請作廢`

後端仍保留 PDM 必要的嚴謹性：soft delete、void、recycle、obsolete、archive、approval、audit、retention、purge 等狀態與責任可以存在，但不得把複雜名詞直接推給一般使用者。

本規格採四個 PDM 最低必要生命週期階段：

- `草稿`
- `審核中`
- `正式`
- `歷史`

但主工作清單只顯示日常會操作的三個階段：`草稿 / 審核中 / 正式`。`歷史` 不作為日常 tab；它依資料性質拆成兩個非日常入口：

- `已刪除資料`：未列管草稿、暫存匯入、未受控附件的復原區。
- `受控歷史`：已作廢、舊版、被取代、正式審核紀錄與 release evidence 的追溯區。

這個模型用來回答使用者最重要的問題：資料現在能不能用、能不能改、能不能刪、需不需要審核、是否屬於 ISO/PDM 受控追溯。

## 2. 已定案決策

| 決策 | 採用方案 |
|---|---|
| 正式資料 UI 語意 | 正式資料不顯示 `刪除`，只顯示 `申請作廢` / `已作廢`。 |
| 一般刪除 | 支援 `還原`。 |
| 審核責任 | 只有正式資料作廢需要審核；草稿與附件由權限直接處理。 |
| UI 階段模型 | 主狀態只顯示 `草稿 / 審核中 / 正式 / 歷史`，其他細節降為輔助標籤。 |
| 主工作清單 | 只顯示 `全部 / 草稿 / 審核中 / 正式`；`全部` 不包含已刪除、已作廢、封存或舊版追溯資料。 |
| 狀態欄資訊層級 | 每列只顯示一個主狀態 badge；狀態意義與輔助標籤說明放在欄位 title 的 `?` popover。 |
| 歷史/刪除入口 | `已刪除資料` 與 `受控歷史` 分開；前者服務復原，後者服務 ISO/PDM 追溯。 |
| 全期授權 | Phase 1-6 一次授權為同一個交付目標，但 RD 仍需保留 phase gate、QC gate 與 stop condition。 |
| Phase 6 邊界 | 不包含 production 或 Supabase production cutover；只做到 local/staging release readiness。 |
| 正式作廢審核 | 沿用既有 review/approval queue pattern，新增 lifecycle obsolete request type。 |

## 2.1 HCS 設計依據

本規格依使用者指定的 HCS 思考習慣收斂：

| HCS | 在本規格中的作用 |
|---|---|
| `#目的` | UI 目的不是展示後端所有狀態，而是讓使用者判斷資料責任與下一步。 |
| `#最佳化` | 主工作清單降到三個日常階段，歷史與刪除改由專用入口處理，避免低頻資料干擾日常掃描。 |
| `#設計思考` | 使用者心智模型收斂成「我還在做 / 別人在審 / 可以用了 / 要去復原或追溯區找」。 |

## 3. 問題定義

目前系統已存在局部刪除語意，但沒有全域架構：

- 附件已有 soft delete 欄位與 DELETE API。
- 料號草稿已有 void/recycle 生命週期。
- 正式圖料號與發行資料已有 obsolete/archive 類狀態。
- `audit_logs` 已是 append-only。

缺口不是「所有資料缺 SQL DELETE」，而是：

- 前端詞彙不一致。
- 使用者無法判斷刪除後能否還原。
- 草稿資料、附件資料、正式資料的管制邊界需要一致規則。
- 還原、作廢與審核責任尚未形成共用規格。
- 若把已刪除資料與已作廢資料都放在同一個 `歷史` 入口，使用者會混淆工作區復原與 ISO/PDM 受控追溯。

## 4. 前端詞彙規格

### 4.1 唯一允許的主操作詞

| 前端操作 | 顯示條件 | 結果描述 |
|---|---|---|
| `刪除` | 資料尚未正式生效，或資料是附件/暫存資料 | 從一般清單移除，可依規則還原。 |
| `還原` | 資料在已刪除視圖中，且後端判斷可恢復 | 恢復到一般清單與原關聯。 |
| `申請作廢` | 資料已正式生效或已進入受控狀態 | 建立審核請求，核准後成為 `已作廢`。 |

### 4.2 禁止作為一般使用者主按鈕的詞

一般 UI 不顯示以下操作詞：

- soft delete
- hard delete
- archive / 封存
- void / 註銷
- recycle / 回收
- revoke / 撤銷
- purge / 清除

例外：管理員稽核明細、技術診斷、匯出欄位或後端事件紀錄可以保留精準名詞。

### 4.3 前端四階段模型

主階段只允許四個：

| 階段 | 使用者心智模型 | 重要性 | 可否一般刪除 | 主要 CTA | 後端狀態映射範例 |
|---|---|---:|---|---|---|
| `草稿` | 還在整理，尚未正式生效 | 中低 | 可，依權限與引用檢查 | `編輯`、`刪除`、`送審` | temporary, staged, draft, need_info, needs_reconfirmation |
| `審核中` | 已進流程，等待決策 | 中高 | 不顯示一般刪除 | `撤回`、`退回`、`核准` | pending_review, approval_requested, obsolete_requested, releasing |
| `正式` | 可被引用，是系統有效資料 | 高 | 不可一般刪除 | `申請作廢` | active, effective, released |
| `歷史` | 不在日常工作清單使用，只到復原或追溯入口查找 | 依資料類別 | 不在主列表操作 | `還原` 或查看追溯 | deleted, obsolete, archived, revoked, terminal rejected |

### 4.4 輔助標籤

輔助標籤只補充風險或差異，不得升為主階段：

| 輔助標籤 | 適用主階段 | 用途 |
|---|---|---|
| `待補` | 草稿 | 資料缺必要欄位、文件、比對或確認。 |
| `已發行` | 正式 | 正式資料已成為發行基準，風險高於一般有效資料。 |
| `可還原` | 歷史 / 已刪除資料 | soft-deleted 資料通過還原檢查。 |
| `不可還原` | 歷史 / 已刪除資料 | 已作廢、已回收重用、唯一鍵衝突或父資料失效。 |
| `被引用` | 草稿 / 正式 / 歷史 | 已被 BOM、圖面、發行、審核或外部分享引用。 |
| `需審核` | 草稿 / 正式 | 下一步會進入 approval。 |

### 4.5 清單篩選

主工作清單若支援生命週期篩選，第一版只使用：

- `全部`
- `草稿`
- `審核中`
- `正式`

`全部` 只包含 `草稿`、`審核中`、`正式`。不得包含已刪除、已作廢、封存、舊版或其他追溯資料。

`歷史` 不作為主工作清單 tab。歷史性資料需由下列獨立入口進入：

| 入口 | 目的 | 主要資料 | 主操作 |
|---|---|---|---|
| `已刪除資料` | 復原未列管或低風險資料 | 未受控草稿、暫存匯入、未受控附件 | `還原`、查看刪除資訊 |
| `受控歷史` | ISO/PDM 追溯 | 已作廢、舊版、被取代、正式審核紀錄、release evidence | 查看追溯、查看審核摘要 |

### 4.6 狀態欄說明入口

清單狀態欄 title 應顯示：

```text
狀態 [?]
```

`?` 必須開啟 popover，而不是只用 hover-only tooltip。Popover 內容至少包含：

- `草稿`、`審核中`、`正式`、`歷史` 的意義。
- `待補`、`已發行`、`被引用`、`需審核`、`可還原`、`不可還原` 的意義。
- `已刪除資料` 與 `受控歷史` 的差異。

主工作清單每列只顯示一個主狀態 badge；輔助標籤預設不塞在主列，可在 drawer、popover、disabled reason 或 detail metadata 顯示。

## 5. 資料分類與策略

| 資料類型 | 前端入口 | 前端操作 | 後端策略 | ISO/PDM 追溯定位 | 審核 | 還原 |
|---|---|---|---|---|---|---|
| 附件 / `file_assets`，未受控 | 主工作清單 / 已刪除資料 | `刪除` / `還原` | `deleted_at/deleted_by/deleted_reason` | 不納入受控追溯；保留基本操作 audit | 不需，依權限 | 需檢查同 entity、分類、revision、檔名衝突 |
| 一般草稿，未送審未受控 | 主工作清單 / 已刪除資料 | `刪除` / `還原` | soft delete 或既有 draft status | 不納入受控追溯；保留基本操作 audit | 不需，依權限 | 需檢查唯一性與引用 |
| 料號草稿 / `part_number_drafts` | 主工作清單 / 已刪除資料或受控歷史，依是否跨受控邊界 | `刪除` / `還原` | 底層可用 `voided`；不得對使用者顯示 recycle | 未跨受控邊界者為刪除資料；跨受控邊界者進受控歷史 | 不需，依權限；若已送審則依 workflow | 未回收、未跨受控邊界、號碼未重用才可還原 |
| 匯入暫存批次與 staging rows | 主工作清單 / 已刪除資料 | `刪除` / `還原` 或 `取消匯入` 視既有流程 | soft delete / rejected / cancelled | 未確認轉正式主檔前不納入受控追溯 | 不需，依權限 | 未確認轉正式主檔才可還原 |
| readonly share / 外部分享 | 主工作清單 / 已刪除資料 | `刪除` | 底層可 `revoked_at` | 不納入受控追溯；保留分享撤銷 audit | 不需，依權限 | 第一版不支援還原，需重新建立分享 |
| 正式料號 / 圖號 | 主工作清單 / 受控歷史 | `申請作廢` | `Obsolete` 或既有 record status | 受控歷史，需追溯 | 需要 | 第一版不支援直接還原；需另走正式恢復/重新送審流程 |
| 已發行 submission / BOM release snapshot | 主工作清單 / 受控歷史 | `申請作廢` 或系統生命週期作廢 | `obsolete_at/obsolete_by` | 受控歷史，需追溯 | 需要或由 release transaction 觸發 | 不支援直接還原 |
| audit logs / approval decisions / release evidence | 受控歷史 | 無刪除操作 | append-only / immutable | 受控歷史，需追溯 | 不適用 | 不適用 |

## 6. 共用後端架構

### 6.1 Lifecycle Policy

RD 應建立共用 policy/service 邊界，例如：

```ts
getLifecycleActionPolicy(entityType, entityId, actor)
deleteEntity(input)
restoreEntity(input)
requestObsoleteEntity(input)
```

實際命名可依專案慣例調整，但必須集中處理：

- 資料類型判斷。
- 公司範圍。
- 目前狀態。
- 權限。
- 引用關係。
- 是否需要 approval。
- 還原衝突。
- audit event。

Route handler 不得各自重寫判斷規則。

### 6.2 Policy Response

前端需要能取得可執行動作與不可執行原因：

```ts
type LifecycleActionPolicy = {
  entityType: string;
  entityId: string;
  visibleStage: "draft" | "in_review" | "formal" | "history";
  stageLabel: "草稿" | "審核中" | "正式" | "歷史";
  uiSurface: "work_list" | "deleted_data" | "controlled_history";
  traceabilityClass: "working" | "uncontrolled_deleted" | "controlled_history";
  detailTags: Array<"待補" | "已發行" | "可還原" | "不可還原" | "被引用" | "需審核">;
  actions: {
    delete?: { allowed: boolean; reasonCode?: string; message?: string };
    restore?: { allowed: boolean; reasonCode?: string; message?: string };
    obsolete?: { allowed: boolean; requiresApproval: boolean; reasonCode?: string; message?: string };
  };
};
```

前端按鈕必須依 policy 顯示，不得只靠狀態字串自行推斷。

`uiSurface` 是 UI 資訊架構的主要分流：

| `uiSurface` | 顯示位置 | 規則 |
|---|---|---|
| `work_list` | 主工作清單 | 只允許 `草稿 / 審核中 / 正式`。 |
| `deleted_data` | 已刪除資料 | 顯示 `歷史` badge，可依 policy 顯示 `還原`。 |
| `controlled_history` | 受控歷史 | 顯示 `歷史` badge，預設只查閱追溯，不提供直接還原正式作廢資料。 |

`traceabilityClass` 是稽核/ISO 定位：

| `traceabilityClass` | 定位 |
|---|---|
| `working` | 日常工作資料，依目前流程與權限管制。 |
| `uncontrolled_deleted` | 未列管資料刪除復原區；不納入受控追溯，但需保留基本操作 audit。 |
| `controlled_history` | 曾正式、已受控或需證明決策的資料；納入 ISO/PDM 追溯。 |

## 7. 狀態轉移

### 7.0 UI 階段轉移

前端主階段應以最低必要轉移呈現：

```text
草稿 -> 審核中 -> 正式 -> 歷史
草稿 -> 歷史
歷史 -> 草稿或正式（只限可還原資料，依原始階段與後端檢查決定）
```

使用者不需要看到後端所有中間狀態。中間狀態應映射成四階段與輔助標籤。

UI 呈現時不得把上述轉移直接做成主工作清單 tab。主工作清單只處理：

```text
草稿 <-> 審核中 -> 正式
```

當資料進入 `歷史`，前端必須依 `uiSurface` 分流：

```text
未列管刪除 -> 已刪除資料
受控作廢 / 舊版 / 被取代 / release evidence -> 受控歷史
```

### 7.1 一般刪除

```text
有效 -> 刪除 -> 已刪除
已刪除 -> 還原 -> 有效
```

刪除時必須記錄：

- actor
- reason
- deleted_at
- related entity
- before summary

還原時必須記錄：

- actor
- reason
- restored_at or audit event
- conflict check result

若資料表不新增 `restored_at` 欄位，仍必須用 audit log 保留還原紀錄。

### 7.2 正式作廢

```text
有效正式資料 -> 申請作廢 -> 待審核 -> 已作廢
```

正式資料不得走一般刪除。作廢必須留下：

- 申請者。
- 作廢原因。
- 影響範圍摘要。
- 審核請求。
- 審核者與決策。
- 作廢後狀態與轉向關係，若適用。

## 8. 還原規則

還原不得只清除 `deleted_at`。後端必須在同一交易內檢查：

- 使用者仍有公司與資料權限。
- 目標仍存在且處於可還原狀態。
- 唯一鍵未被其他有效資料占用。
- 對附件：同 entity、document category、revision、file name 沒有 active duplicate。
- 對草稿號：號碼未被正式料號、有效草稿或回收重發占用。
- 對匯入暫存：批次未被確認轉正式主檔。
- 對關聯資料：父資料未被作廢、刪除或跨公司。

若任一檢查失敗：

- 不顯示 `還原`，或顯示 disabled。
- API 回傳 domain reason code。
- UI 顯示一句可理解原因。

範例：

```text
此附件已有同名有效版本，不能還原。
此草稿號已被重新使用，不能還原。
正式資料已作廢，不能用還原復原。
```

## 9. 權限規格

### 9.1 草稿與附件

第一版可直接由權限處理：

- 建立者可刪除與還原自己的未受控草稿。
- 具備附件管理權限者可刪除與還原附件。
- `pdm_admin` 或等效管理角色可處理公司範圍內資料。
- 所有操作需受 company scope 約束。

### 9.2 正式資料

正式資料只能 `申請作廢`：

- 是否可申請由既有 approval matrix / role permissions 決定。
- 是否核准由既有審核流程處理。
- 申請者不得繞過審核直接修改正式狀態。

### 9.3 不可刪資料

下列資料不提供 UI 操作：

- audit logs
- approval decisions
- release evidence
- immutable history records

## 10. API 合約

第一版可以採共用 lifecycle endpoint，也可以在既有 resource route 下新增 action endpoint。無論路由形式如何，必須共用同一 policy/service。

建議概念：

| API | 用途 |
|---|---|
| `GET /api/lifecycle/policy?entityType=&entityId=` | 查詢可見狀態與可執行動作。 |
| `POST /api/lifecycle/delete` | 執行一般刪除。 |
| `POST /api/lifecycle/restore` | 執行還原。 |
| `POST /api/lifecycle/obsolete-requests` | 建立正式資料作廢申請。 |

若沿用現有 resource route，例如附件已使用 `DELETE /api/parts/{partNumber}/attachments/{attachmentId}`，則必須補上對應 restore action，並讓 policy 結果一致。

## 11. Schema 與 migration 方向

### 11.1 Soft-deletable tables

新納入一般刪除的資料表應優先支援：

- `deleted_at`
- `deleted_by`
- `deleted_reason`
- `updated_at`

還原歷程可用欄位或 audit event 表達。若需要查詢還原次數，可新增獨立 lifecycle event table；第一版不強制。

### 11.2 Formal lifecycle tables

正式資料優先沿用既有：

- `record_status = 'Obsolete'`
- `obsolete_at`
- `obsolete_by`
- approval request / decision
- replacement / redirect link

不得為了讓列表消失而硬刪正式主資料。

## 12. UI 規格

### 12.1 一般清單

主工作清單預設顯示日常資料，篩選 tab 固定為：

```text
[全部] [草稿] [審核中] [正式]
```

主工作清單規則：

- `全部` 只包含 `草稿`、`審核中`、`正式`。
- 主工作清單不得顯示已刪除、已作廢、封存、舊版或 release evidence。
- 主工作清單右上角或側邊可提供低干擾入口：`已刪除資料`、`受控歷史`。
- `已刪除資料` 與 `受控歷史` 不得和主要 CTA 搶視覺權重。

### 12.1.1 已刪除資料

`已刪除資料` 是復原區，不是 ISO/PDM 受控歷史區。第一版包含：

- 未受控草稿。
- 暫存匯入。
- 未受控附件。
- 可被 soft delete 且未進入正式受控邊界的資料。

列表需顯示：

- 主狀態 badge：`歷史`。
- 刪除者、刪除時間、刪除原因。
- 原始資料位置或關聯主檔。
- `還原` CTA，僅在 policy 允許時顯示。
- 不可還原時顯示 disabled reason。

`已刪除資料` 必須保留基本操作 audit，但不被視為 ISO 9001 受控追溯記錄。

### 12.1.2 受控歷史

`受控歷史` 是追溯區，用於 ISO/PDM 受控資料。第一版包含：

- 已作廢正式料號、圖號、BOM、submission。
- 舊版、被取代版本、release snapshot。
- 正式審核紀錄、approval decisions、release evidence。

列表需顯示：

- 主狀態 badge：`歷史`。
- 作廢/取代/發行/審核時間。
- 申請者、審核者、原因與決策摘要，若適用。
- 來源正式資料與替代/被取代關係，若適用。
- 查看追溯 CTA。

受控歷史不提供一般 `還原`。正式作廢資料若未來需要恢復，必須另走正式恢復或重新送審流程，不屬於第一版。

### 12.2 確認視窗

刪除確認：

```text
刪除後可從已刪除資料還原。
```

作廢確認：

```text
正式資料作廢後需審核，並會保留追溯紀錄。
```

還原確認：

```text
還原後此資料會重新出現在一般清單。
```

### 12.3 正式資料

正式資料頁面不顯示 `刪除`。只顯示：

- `申請作廢`：尚未作廢且使用者有權限。
- `已作廢`：作廢完成。
- `作廢審核中`：申請已送出但未決。

### 12.4 階段 Badge 與列表資訊層級

每筆支援 lifecycle policy 的資料在主列表與 drawer header 都必須顯示一個主階段 badge。

主工作清單只顯示：

- `草稿`
- `審核中`
- `正式`

`歷史` 只顯示在 `已刪除資料` 與 `受控歷史` 入口內。

主工作清單每列預設不顯示輔助標籤。狀態意義與輔助標籤說明放在 `狀態 [?]` popover；資料本身的輔助標籤可在 drawer、action disabled reason、審核提示或詳情 metadata 呈現。避免一列資料塞滿狀態，造成掃描困難。

建議資訊層級：

| 層級 | 顯示內容 |
|---|---|
| 主列 | 主階段 badge、主識別碼、名稱、負責人、主要下一步 CTA。 |
| 狀態欄 title | `?` popover 說明主狀態、輔助標籤、已刪除資料與受控歷史差異。 |
| Drawer | 後端完整狀態、審核歷程、引用關係、刪除/作廢/還原紀錄。 |
| 已刪除資料 | 刪除者、刪除時間、刪除原因、還原狀態。 |
| 受控歷史 | 作廢/取代/審核/release 追溯資料。 |

### 12.5 UX Intent

- 使用者：RD、主管、PDM 管理員、文件/品質相關角色。
- 使用情境：在主工作清單快速判斷日常資料是否可編輯、審核或正式使用；需要復原或追溯時切到專用入口。
- 使用的 HCS 思考習慣：`#目的`、`#最佳化`、`#設計思考`、`#差距分析`、`#心理成因`、`#問對問題`。
- 使用者心智模型：我還在做、別人在審、可以用了、要去復原區或追溯區找。
- 主要任務：掃描主工作清單後判斷是否要編輯、送審或申請作廢；必要時到已刪除資料還原，或到受控歷史追溯。
- 成功狀態：5 秒內能辨識日常資料階段、主要 CTA、高風險操作，以及已刪除資料/受控歷史不在主列表。
- 最可能誤解點：把 `全部` 誤認為包含已刪除/已作廢；把已刪除資料當成 ISO 受控歷史；把正式資料誤認為可直接刪除。
- 高風險操作：刪除、還原、申請作廢、核准作廢。
- 安全預設/復原方式：正式資料不顯示刪除；未列管刪除資料進已刪除資料；受控資料作廢進受控歷史且需審核。
- 必須留在主畫面的資訊：三個日常狀態 badge、主要 CTA、disabled reason、已刪除資料/受控歷史入口。
- 可降層到 drawer/details/popover/audit 的資訊：狀態與輔助標籤定義、後端原始狀態、事件細節、完整審核紀錄、技術欄位。

## 13. RD 開發切片

使用者已選擇 `1A / 2A / 3A`：Phase 1-6 作為同一個 local/staging 交付目標一次授權，但 RD 必須保留內部 phase gate、QC gate、stop condition；production 與 Supabase production cutover 不在本交付內；正式作廢沿用既有 review/approval queue pattern。

| Phase | 目的 | 主要交付 | 驗收邊界 | 目前狀態 |
|---:|---|---|---|---|
| 1 | Lifecycle policy foundation + 附件刪除/還原 | 共用 lifecycle policy/service、`visibleStage/stageLabel/uiSurface/traceabilityClass/detailTags`、master attachment deleted-data API、restore routes、duplicate/parent/company guard、附件 `已刪除資料` UI、delete/restore audit | `QA-LIFE-001` to `QA-LIFE-011` applicable subset, `QA-LIFE-018` to `QA-LIFE-022` applicable subset | 已實作並有 QC evidence |
| 2 | 草稿、暫存、未送審資料刪除/還原 | 料號草稿、匯入暫存/批次、BOM workbench 草稿等 uncontrolled working data 的 `刪除` / `還原`、deleted-data surface、number reuse / conversion / formal-boundary restore block | 未列管資料不出現在日常清單；可還原與不可還原因 policy 清楚呈現；跨受控邊界不可當作一般刪除復原 | 料號草稿、匯入批次、BOM workbench 草稿已實作並有 QC evidence；其他未送審資料依模組 discovery 補齊 |
| 3 | 日常 UI 階段與資訊架構一致化 | 主工作清單只顯示 `全部/草稿/審核中/正式`；`全部` 排除 deleted/obsolete/history；每列一個主狀態 badge；`狀態 [?]` popover；低干擾入口 `已刪除資料` / `受控歷史` | 使用者能在主清單快速判斷日常階段；`歷史` 不作為日常 tab；輔助標籤不升為主狀態 | 部分 module 已在 Phase 1-2 落地；全域一致化仍需 Phase 5/6 regression |
| 4 | 正式資料作廢申請一致化 | 正式料號、圖號、released BOM、released submission 不顯示 `刪除`；顯示 `申請作廢`；建立 lifecycle obsolete request；主管核准/退回；核准後 `已作廢`；作廢 audit 與 responsibility chain | 正式資料作廢不得繞過審核；作廢紀錄進 `受控歷史`，不得出現在 `已刪除資料` | formal 料號、圖號、released BOM、released submission 已實作並有 QC evidence |
| 5 | 受控歷史 UI 與追溯 | `受控歷史` entry；作廢/舊版/被取代/review/approval/release evidence 查詢；申請者、審核者、時間、原因、決策摘要；immutable evidence negative paths | 受控歷史只查閱追溯，不提供一般 `還原` / `刪除`；audit、approval decisions、release evidence 不可被一般 UI 破壞 | 待實作 |
| 6 | Local/staging release readiness | Lifecycle regression suite、QC summary、schema/migration notes、rollback notes、local/staging smoke evidence、production exclusion proof、Git boundary | 不觸碰 production 或 Supabase production；production 必須另走 deployment-release gate | 待實作 |

## 14. 驗收標準

### 14.1 前端詞彙

- 一般使用者主操作只看到 `刪除`、`還原`、`申請作廢/已作廢`。
- 正式資料頁面不顯示 `刪除`。
- 草稿、附件、暫存資料不顯示 `作廢` 作為主要刪除入口。
- `void/recycle/archive/soft delete` 不出現在一般操作按鈕。

### 14.1.1 前端階段

- 所有納入 lifecycle policy 的列表與 drawer header 都顯示且只顯示一個主階段。
- 主工作清單只顯示 `草稿`、`審核中`、`正式`；不得顯示 `歷史` tab。
- 主工作清單篩選只使用 `全部`、`草稿`、`審核中`、`正式`。
- `全部` 不包含已刪除、已作廢、封存、舊版或 release evidence。
- `歷史` badge 只出現在 `已刪除資料` 與 `受控歷史` 入口內。
- `待補`、`已發行`、`可還原`、`不可還原`、`被引用`、`需審核` 只作為輔助標籤或 detail metadata，不得成為主列表 tab。
- 狀態欄 title 有 `?` popover，並說明主狀態、輔助標籤、已刪除資料與受控歷史差異。
- 使用者 5 秒內能判斷資料是「還在整理」、「等待審核」、「正式可用」，且知道已刪除/已作廢要去專用入口找。

### 14.2 刪除

- 刪除不執行 SQL hard delete。
- 刪除後資料不出現在有效清單。
- `已刪除資料` 可看到刪除時間、刪除者、原因。
- 刪除操作寫入 audit 或等效事件。
- 未列管草稿、暫存與未受控附件的刪除不納入 ISO 受控追溯，但必須保留基本操作 audit。

### 14.3 還原

- 可還原資料能回到有效清單。
- 還原前執行 duplicate / controlled-boundary / company scope 檢查。
- 發生衝突時不還原，並顯示可理解原因。
- 還原操作寫入 audit 或等效事件。

### 14.4 作廢

- 正式資料作廢必須走審核。
- 審核前不得直接改為作廢狀態。
- 核准後狀態為已作廢，且不被一般清單誤判為已刪除。
- 作廢後進入 `受控歷史`，仍可查詢追溯與稽核。
- 已作廢資料不得出現在 `已刪除資料`。

### 14.5 稽核與資料安全

- `audit_logs` 仍不可 update/delete。
- approval decisions 與 release evidence 不提供刪除或還原。
- 清理或 purge 不屬於一般 UI 功能。

## 15. QA 驗證方向

QA 計畫需至少涵蓋：

- 主工作清單 tab：`全部`、`草稿`、`審核中`、`正式`，且 `全部` 不含已刪除/已作廢。
- `歷史` 不出現在主工作清單 tab。
- `狀態 [?]` popover 可開啟並說明主狀態、輔助標籤、已刪除資料與受控歷史差異。
- 輔助標籤不超過主階段層級，且不取代主階段或主列表 tab。
- 5 秒理解檢查：使用者能辨識目前階段、下一步 CTA 與高風險操作。
- 附件刪除、`已刪除資料` 列表、還原、duplicate restore block。
- 料號草稿刪除與還原；已跨受控邊界不可還原。
- 正式料號/圖號頁面不出現刪除，只能申請作廢。
- 作廢申請需建立 approval request，核准前狀態不變。
- 已作廢正式資料進 `受控歷史`，不得出現在 `已刪除資料`。
- 前端詞彙掃描：一般按鈕不得出現被禁止詞彙。
- audit append-only regression。
- company scope：跨公司使用者不可刪除、還原或作廢其他公司資料。

## 16. 範圍外

第一版不包含：

- 物理 purge UI。
- 正式作廢資料的直接還原。
- 自動刪除實體檔案。
- 自動清理 Google Drive 或外部 storage 物件。
- 新增完整 retention policy 或資料銷毀 SOP。
- 改寫既有所有狀態機；第一版以 policy mapping 與高風險入口收斂為主。
- 受控歷史的完整 ISO 文件保存年限 SOP；本規格只定義 UI 與系統邊界。

## 17. Open Questions

| 類型 | 問題 | 是否阻塞 RD |
|---|---|---|
| Open question | 第一版是否只納入附件、料號草稿、正式圖料號/BOM，其他模組延後？ | 否，使用者已授權 Phase 1-6 作為同一交付目標；仍以 phase gate 分段驗收。 |
| Open question | `restore` 是否使用共用 endpoint 或保留 resource-specific endpoint？ | 否，service contract 已定義。 |
| Open question | `已刪除資料` 與 `受控歷史` 最終放在右上角入口、側邊導覽或進階查詢頁？ | 否，資訊架構邊界已定，路由位置可由 UI 實作決定。 |
| Deferred scope | 正式作廢資料的恢復流程是否需要另開 spec？ | 否，本交付仍不支援正式作廢資料直接還原；未來需另開正式恢復/重新送審 spec。 |

目前沒有阻塞 RD Phase 1-6 local/staging full-scope implementation 的 blocker。Production、Supabase production cutover、physical purge、retention job、正式作廢資料直接還原仍明確排除。

## 18. 規格治理 Gate 結果

已檢查文件：

- `.ai-doc/dev_task.md`
- `.ai-doc/documentation_map.md`
- `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-implementation-contract.md`
- `.ai-doc/specs/SPEC-UX-PLATFORM-001-multi-role-pdm-platform-ux.md`
- `.ai-doc/specs/SPEC-PDM-DETAIL-DRAWER-001-system-detail-drawer-standard.md`
- `.ai-doc/decisions/ADR-PDM-CHANGE-CONTROL-001-reserved-draft-number-policy.md`
- `.ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md`

Cross-spec consistency：

- 與 numbering spec 的「正式號碼不可重用」一致。
- 與 change-control ADR 的「預留草稿號可回收、受控料號不可回收」一致。
- 新規格不覆蓋既有 BOM 工作台節點刪除；BOM 編輯器內部刪除行為屬編輯操作，不等同主資料生命週期刪除。
- 新規格補足 UI 詞彙邊界，不取代既有狀態機。
- 2026-06-29 補充的四階段模型是 UI 可視化映射，不取代後端正式狀態機。
- 2026-06-29 補充的 UI IA 決策將 `已刪除資料` 與 `受控歷史` 分開；這是對四階段模型的呈現層修正，不改變後端作廢與 soft delete 的既有資料責任。
- 2026-06-29 cross-spec UI rule: change-control module/domain states such as `待審核`、`已發行`、`需重新確認`、`作廢` remain valid behind the lifecycle policy, but main daily UI badges must use lifecycle `visibleStage/stageLabel`. For example, `待審核` maps to `審核中`, `已發行` maps to `正式` with `已發行` as a detail tag, and approved obsolete records map to `歷史` under `受控歷史`.

ADR：

- 已建立 `ADR-PDM-LIFECYCLE-ACTIONS-001`，因本規格影響生命週期、權限、審核與稽核。

RD readiness：

- Phase 1-6 可作為同一個 local/staging 交付目標開始 RD；內部仍需依 phase gate、QC gate 與 stop condition 分段推進。
- Phase 1-6 需提供 `visibleStage`、`stageLabel`、`uiSurface`、`traceabilityClass` 與 `detailTags`，供 UI 以主工作清單、已刪除資料、受控歷史三個入口呈現。
- Draft/temp/not-submitted restore、formal obsolete request、controlled-history UI、local/staging release readiness 均已納入 full-scope implementation contract。
- Production 與 Supabase production cutover 需另走 deployment-release gate，不屬於本次 RD-ready 範圍。

QA readiness：

- Focused QA plan 已建立：`.ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md`。
- RD Phase 1-6 可依該 QA plan 驗證 lifecycle policy output、UI surface、traceability class、主列表 vocabulary、restore conflict、obsolete approval、controlled history、audit、company scope 與 local/staging release readiness。

Implementation readiness：

- RD Phase 1-6 full-scope implementation contract 已建立：`.ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md`。
- 使用者 HCS 決策 `1A / 2A / 3A` 已納入：一次授權 Phase 1-6、production excluded、正式作廢沿用既有 review/approval queue pattern。

## 19. 2026-08-18 DEV-077 Amendment：正式編號草稿的終止語意

### 19.1 Authority and Scope

決策來源：使用者於 2026-08-18 採用 `HD-077-01..03`。本節只治理已配置 official identifier 的圖料根號 bundle；不改寫 client-only draft、candidate workspace、`part_number_drafts`、附件 soft delete 或 provisional number recycle。

### 19.2 Lifecycle Classification

| Object boundary | Visible stage | User action | Result surface | Approval | Restore / reuse |
|---|---|---|---|---:|---|
| 未配置 official number 的 candidate／provisional draft | 草稿 | 原 authority 的取消／刪除 | 原 draft surface | 否 | 依原 authority |
| 已配置 official number，root＋children 全為 Draft／NeedInfo且 zero controlled reference | 草稿 | `作廢草稿編號` | `受控歷史` | 否 | 均禁止 |
| Active／Released、既有 `MainDrawingInvalid` formal-responsibility 投影，或 Draft／NeedInfo bundle 已有受控引用 | 依目前投影 | `申請作廢` | pending approval；核准後 `受控歷史` | 是 | 均禁止 |
| Obsolete | 歷史 | 查看追溯 | `受控歷史` | 不適用 | 均禁止 |

`作廢草稿編號` 是不可恢復的 terminal transition，不是本規格 4.1 所稱可依規則還原的 `刪除`。DEV-077 scope 下，4.1、4.3、7.2、9.1 與 16 的舊一般規則應依本節解讀。

### 19.3 Server Policy and Transaction

- server-owned policy 必須同時計算 identity boundary、root／children status、controlled references、permission、company scope與environment capability；client 不得只用 status 推導 enabled。
- direct transition 前在同一 transaction 重檢 root 與全部 children 皆為 Draft／NeedInfo，且沒有 pending approval、revision package、shared CAD model、manufacturing baseline、replacement link、BOM reconfirmation或等效受控引用。
- controlled-reference predicate 必須與既有 hard-delete dependency scan 共用同一 authority或忠實包裝；production 不得有較弱 shortcut。
- 成功只更新 status／timestamps，保留 identifiers、rows、relations、attachments、sequence與audit；一般附件存在不自動阻擋，但不得被刪除，已成為 controlled package 的附件由 reference predicate 阻擋。
- audit 最少包含 actor、company、reason、before／after、target counts、timestamp與capability slice。
- stale、duplicate、concurrent、cross-company、no-permission與mixed-status request 必須 zero partial mutation；已 Obsolete 不得再寫第二筆有效 transition audit。
- SQLite transaction固定`BEGIN IMMEDIATE`；PostgreSQL固定`SERIALIZABLE`並鎖company-scoped root／parts／drawings後才重讀status與dependency。serialization／deadlock回retryable conflict，不得轉成partial success。
- direct obsolete與obsolete request使用既有platform command receipt／outbox；固定command name與Idempotency-Key payload fingerprint。相同key同payload replay原result，同key不同payload拒絕。

### 19.4 API and Permission Boundary

- Draft direct-obsolete：`POST /api/numbering/records/[rootCode]/obsolete` 或等效既有 resource action，request 需 reason 與 explicit confirmation。
- Draft hard-delete compatibility：`DELETE /api/numbering/records/[rootCode]/draft` 不再是 owner UI lifecycle；production 永久拒絕。
- Draft permission 沿用 `numbering.draft.obsolete` 與 company scope，不新增角色語意。
- Formal request 沿用 `obsolete_part_root`、`obsolete_part_number`、`obsolete_ma_drawing`；request 建立不改正式 status，approval decision 才 transition。
- 受控但仍為 Draft／NeedInfo 的bundle必須走root-scoped `obsolete_part_root`；impact／snapshot需包含受控原因與targets，approved後才把核定targets轉`Obsolete`。不得因既有formal-target filter而讓這類bundle無合法終點。
- Generic approval endpoint 在 production 必須先讀 request action code，僅對已開放 obsolete actions 生效；其他 approval／release／submission actions繼續 fail closed。
- Root impact additive輸出`policy`、`controlledReferences`、`approvalTargets`；policy action為`obsolete_draft_official_number|request_formal_obsolete|none`，availability為`hidden|inert|enabled`。client不得由status重算。
- Root approval snapshot保存`schemaVersion=1`、完整child target set與expected status、dependency IDs／counts及fingerprint；approved apply重算時排除目前obsolete request ID，其他target／status／dependency漂移均回`ROOT_OBSOLETE_SNAPSHOT_STALE`並整筆rollback。

### 19.5 UX and Error Contract

- root drawer 的 allocated draft action label 為 `作廢草稿編號`；formal label 為 `申請圖料根號作廢`，兩者不得同時 enabled。
- write capability 尚未開放時，控制可見但必須 inert，提供 keyboard／touch 可讀理由，且 network write count=0。
- direct-obsolete dialog 顯示 root code、part／drawing counts、不可回收、將進受控歷史、reason與acknowledgement；取消／關閉不得 mutation。
- API 可保留 stable machine code，但一般 UI 不得顯示 raw code、route、HTTP錯誤或stack；blocked state需說明人類影響與恢復路徑。

### 19.6 Acceptance and Stop Conditions

- eligible bundle 完成後 root／children均為 `Obsolete`，default active list排除，include-history／受控歷史與audit可查，identifier永不再配置。
- formal request approved前status不變；rejected／needs_info不直接異動；pending request阻止duplicate。
- 任一 controlled reference、mixed status、permission/company mismatch或concurrency conflict均 fail closed且zero partial mutation。
- 若RD需要hard delete、sequence reuse、production data repair、schema migration，或無法對generic approval route做action-level isolation，停止並回DEV-077／PM。
- Focused QA authority：`.ai-doc/qa/qa-dev-077-official-numbering-obsolete-production-lifecycle-validation-plan-2026-08-18.md`。

### 19.7 Implementation and Migration Boundary

- `No schema migration / No data backfill / No local-cache migration`；既有`Obsolete`、approval JSON、audit與platform command tables足以承載本變更。
- Exact file impact、error mapping、failure recovery、驗證命令與A→B→C順序以DEV-077 `RD Implementation Contract`為準；任何新增schema需求都會使本readiness失效並回PM。
- 本 amendment 已達`RD Implementation Ready / RD Implemented`；local／isolated staging implementation 已完成，但不授權production gate值、部署、正式資料或release。
