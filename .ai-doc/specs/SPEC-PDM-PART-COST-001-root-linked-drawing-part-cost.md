# SPEC-PDM-PART-COST-001：主根號關聯圖號料號與料號成本模組

狀態：Draft / Backlog
日期：2026-06-03
適用系統：AI_PDM
關聯任務：`DEV-PDM-PART-COST-001`
延伸規格：`SPEC-PDM-NUMBERING-001`

## 1. 文件目的

將未來「一張圖對應多個料號，且不同料號成本不同」的產品資料模型整理成可開發規格。此規格延伸既有圖號與料號自動化模組，讓系統同時具備圖號模組與料號模組，兩者透過相同主根號自動關聯，但各自保留不同責任邊界。

## 2. 已定案輸入

| 項目 | 使用者決策 |
|---|---|
| 一圖多料號原因 | 不同材質、不同顏色。 |
| 成本主軸 | 以標準成本為主，但保留其他成本欄位。 |
| 成本情境 | 例如標準成本適用委外加工，同一料件仍可記錄自行製作成本。 |
| 數量影響 | 成本會隨數量改變。 |
| 成本變更權限 | 採購可變更成本，主管審核。 |
| 圖面改版影響 | 圖面改版不需要觸發成本重審。 |
| 模組期望 | 系統同時有圖號及料號模組，彼此依相同主根號自動關聯。 |

## 3. 核心設計原則

1. 主根號是圖號與料號的共同 family identity。
2. 圖號管理技術文件、版次、用途與發行狀態。
3. 料號管理實際採購、製造、材質、顏色、成本、BOM 與庫存語意。
4. 成本屬於料號，不屬於圖號。
5. 同一張 MA 圖可服務多個料號，但每個料號仍可有不同材質、顏色與成本。
6. 標準成本不是單一可任意覆蓋欄位，而是經審核後被指定為 current standard 的成本版本。
7. 圖面改版不自動觸發成本重審；只有料號變體、成本資料或採購/製造條件變更才進入成本審核。
8. 採購可提出成本變更，但主管核准前不得改變正式標準成本。

## 4. 範圍

### 4.1 第一版包含

- 圖號模組與料號模組分流入口。
- 依主根號自動關聯圖號與料號。
- 同一主根號下允許多個料號變體。
- 料號變體至少支援材質與顏色。
- 料號成本 profile 管理，保留委外、自製、採購、試算等成本情境。
- 成本隨數量級距變化。
- 採購送出成本變更，主管審核後生效。
- current standard cost 指向已核准成本 profile 與級距基準。
- 成本歷史版本保留，不覆寫舊資料。
- 圖面改版不觸發成本重審，但 UI 顯示圖面版次與成本版本是否同時有效。

### 4.2 第一版不包含

- 自動從供應商報價單解析成本。
- 自動計算製程工時成本。
- ERP 庫存成本同步。
- 幣別匯率自動換算。
- 依圖面改版自動推估成本變動。
- 強制標準化所有材質與顏色字典；第一版可先用欄位與自由輸入，後續再整理字典。

## 5. 名詞定義

| 名詞 | 定義 |
|---|---|
| 主根號 | 圖號與料號共用的根識別，例如 `0001`。 |
| 圖號 | 技術文件識別，例如 MA 製造圖或 OT 參考圖。 |
| 料號 | 實際採購、製造、BOM、成本與庫存使用的 item identity。 |
| 料號變體 | 同一主根號下因材質、顏色、表面處理、包裝或其他商業/製造差異而產生的料號。 |
| 成本 profile | 某個料號在特定成本情境下的一組成本資料，例如委外、自製、採購。 |
| 成本級距 | 同一成本 profile 下，依數量區間產生不同單價或設定費。 |
| 標準成本 | 經主管核准並被指定為正式使用的成本 profile / 級距基準。 |

## 6. 建議資料模型

### 6.1 沿用既有核心表

| 表 | 用途 |
|---|---|
| `part_roots` | 主根號主檔，作為圖號與料號共同 family identity。 |
| `drawing_numbers` | 圖號主檔，管理 MA / OT、版次、狀態與技術文件關係。 |
| `part_numbers` | 料號主檔，管理 item identity、料件類型、狀態與主根號。 |
| `drawing_part_links` | 圖號與料號關聯，支援一圖多料號。 |
| `same_drawing_variants` | 同圖多料號差異欄位，可延伸保存材質/顏色差異說明。 |

### 6.2 新增或延伸表

| 表 | 用途 |
|---|---|
| `part_variant_attributes` | 保存料號變體屬性，例如材質、顏色、表面處理、包裝。 |
| `part_cost_profiles` | 保存料號在不同成本情境的成本版本。 |
| `part_cost_tiers` | 保存成本 profile 的數量級距與單價。 |
| `part_standard_costs` | 指定某料號目前有效的標準成本來源。 |
| `part_cost_change_requests` | 採購提出成本變更、主管審核、退回與生效紀錄。 |

### 6.3 `part_variant_attributes`

建議欄位：

| 欄位 | 說明 |
|---|---|
| `id` | 主鍵。 |
| `part_number_id` | 對應料號。 |
| `material_code` | 材質代碼，可先 nullable。 |
| `material_label` | 材質名稱或自由輸入。 |
| `color_code` | 顏色代碼，可先 nullable。 |
| `color_label` | 顏色名稱或自由輸入。 |
| `surface_treatment` | 表面處理。 |
| `variant_note` | 差異說明。 |
| `created_at` / `updated_at` | 稽核時間。 |

### 6.4 `part_cost_profiles`

建議欄位：

| 欄位 | 說明 |
|---|---|
| `id` | 主鍵。 |
| `part_number_id` | 對應料號。 |
| `cost_type` | `outsource`、`in_house`、`purchase`、`trial`。 |
| `currency` | 幣別，第一版可預設 TWD。 |
| `uom` | 單位，例如 `pcs`。 |
| `supplier_id` | 供應商，可 nullable。 |
| `process_note` | 製程、加工或試算說明。 |
| `status` | `draft`、`pending_review`、`approved`、`rejected`、`obsolete`。 |
| `effective_from` / `effective_to` | 生效區間。 |
| `created_by` | 建立者，採購可建立。 |
| `approved_by` / `approved_at` | 主管核准紀錄。 |

### 6.5 `part_cost_tiers`

建議欄位：

| 欄位 | 說明 |
|---|---|
| `id` | 主鍵。 |
| `cost_profile_id` | 對應成本 profile。 |
| `min_qty` | 最小數量。 |
| `max_qty` | 最大數量，無上限可 nullable。 |
| `unit_cost` | 單位成本。 |
| `setup_cost` | 開機費、治具費或一次性成本，可 nullable。 |
| `lead_time_days` | 交期天數，可 nullable。 |
| `note` | 級距備註。 |

### 6.6 `part_standard_costs`

建議欄位：

| 欄位 | 說明 |
|---|---|
| `id` | 主鍵。 |
| `part_number_id` | 對應料號。 |
| `cost_profile_id` | 被指定為標準成本的 profile。 |
| `basis_qty` | 標準成本採用的基準數量。 |
| `effective_from` / `effective_to` | 標準成本生效區間。 |
| `reason` | 指定原因。 |
| `approved_by` / `approved_at` | 主管核准紀錄。 |

### 6.7 `part_cost_change_requests`

建議欄位：

| 欄位 | 說明 |
|---|---|
| `id` | 主鍵。 |
| `part_number_id` | 對應料號。 |
| `request_type` | `create_profile`、`update_profile`、`set_standard`、`obsolete_profile`。 |
| `requested_by` | 提出者，採購可提出。 |
| `review_status` | `pending`、`approved`、`rejected`、`cancelled`。 |
| `payload_before` / `payload_after` | 異動前後 JSON snapshot。 |
| `reason` | 採購變更理由。 |
| `reviewed_by` / `reviewed_at` | 主管審核紀錄。 |
| `review_comment` | 審核意見。 |

## 7. 自動關聯演算法

### 7.1 目標

當圖號與料號具有相同 `part_root_id` 時，系統自動建立或提示建立關聯，讓使用者在圖號模組與料號模組都能看到彼此。

### 7.2 規則

```text
Input: drawing_number_id, part_number_id

if drawing.part_root_id != part.part_root_id:
  block auto link

if drawing.drawing_type != "MA":
  create reference link only, not primary manufacturing link

if drawing is MA and part has no primary MA link:
  create primary drawing_part_link

if drawing is MA and part already has primary MA link:
  create candidate link or require manual decision

if multiple parts share same MA drawing:
  require variant attributes or same_drawing_variants difference note
```

### 7.3 防呆

- 不得只靠字串前綴比對圖號與料號，必須比對 `part_root_id`。
- 同主根號不代表所有圖都可作製造圖；只有 MA 圖可作 primary manufacturing link。
- 若同一主根號下已有多張 MA 圖，系統需提示使用者選擇主要關聯。
- 若一圖多料號但缺少材質/顏色/差異欄位，DVT 或 Release 階段必須阻擋或要求補齊。

## 8. 成本解析演算法

### 8.1 標準成本解析

```text
Input: part_number_id, quantity, valuation_date

standard = active part_standard_costs
  where part_number_id = input.part_number_id
  and effective_from <= valuation_date
  and (effective_to is null or effective_to >= valuation_date)

if no standard:
  return "No approved standard cost"

profile = approved part_cost_profiles by standard.cost_profile_id
tier = find tier where min_qty <= quantity and (max_qty is null or quantity <= max_qty)

if no tier:
  return "No cost tier for quantity"

return tier.unit_cost, tier.setup_cost, profile.cost_type, standard.basis_qty
```

### 8.2 指定成本情境解析

```text
Input: part_number_id, cost_type, quantity, valuation_date

profiles = approved part_cost_profiles
  where part_number_id = input.part_number_id
  and cost_type = input.cost_type
  and effective_from <= valuation_date
  and (effective_to is null or effective_to >= valuation_date)

tiers = matching tiers by quantity

choose profile with latest effective_from

if multiple profiles tie:
  return ambiguous result and require user decision
```

## 9. 工作流程

### 9.1 圖號模組

1. RD 建立或查詢圖號。
2. 系統顯示同主根號料號清單。
3. MA 圖頁面顯示已關聯料號、材質、顏色、目前標準成本狀態與是否缺成本。
4. 圖面改版時只更新圖號版次與文件狀態，不自動建立成本重審。
5. 若圖面改版造成材質、顏色或製程條件實際變更，使用者需另行建立料號或成本變更申請。

### 9.2 料號模組

1. 使用者以主根號建立料號變體。
2. 系統要求或提示填寫材質與顏色。
3. 系統依相同主根號尋找可關聯 MA 圖。
4. 料號頁面顯示關聯圖號、BOM 使用狀態、成本 profile、標準成本與審核紀錄。
5. 同一主根號下可並列顯示所有料號變體，方便比較材質、顏色與成本。

### 9.3 成本模組

1. 採購建立或更新成本 profile。
2. 採購設定數量級距、單價、設定費、供應商或製程說明。
3. 採購送出成本變更申請。
4. 主管審核核准後，成本 profile 才可成為 approved。
5. 若需要設為標準成本，需另以 `set_standard` 類型指定 profile 與基準數量。
6. 舊標準成本保留歷史，不覆寫。

## 10. 權限建議

| 角色 | 能力 |
|---|---|
| RD / 工程師 | 可建立圖號、料號、變體說明；可查看成本狀態但不可核准成本。 |
| 採購 | 可建立與修改成本草稿、送出成本變更。 |
| 主管 | 可審核成本 profile 與標準成本指定。 |
| PDM 管理員 | 可維護資料字典、修正關聯、處理例外與 audit。 |
| 製造 / 品保 | 可查看料號、圖號、標準成本狀態與生效版本；是否可看金額需依公司權限定義。 |

## 11. UI 需求

### 11.1 圖號明細頁

- 顯示主根號。
- 顯示同主根號料號清單。
- 顯示每個料號的材質、顏色、狀態、目前標準成本狀態。
- 顯示此圖是否為該料號 primary MA 圖。
- 提供「建立同根料號變體」入口。

### 11.2 料號明細頁

- 顯示主根號與關聯圖號。
- 顯示材質、顏色與差異說明。
- 顯示成本 profile 分頁：標準成本、委外、自製、採購、試算。
- 顯示數量級距表。
- 顯示成本審核紀錄。
- 提供「送出成本變更」入口給採購。

### 11.3 成本審核中心

- 顯示待審成本變更。
- 顯示異動前後比較。
- 顯示受影響料號、BOM 或採購資料。
- 主管可核准或退回。
- 退回必填原因。

## 12. QA / FMEA 風險表

| 風險 | 原因 | 影響 | 偵測方式 | 對策 |
|---|---|---|---|---|
| 成本錯掛到圖號 | 圖號與料號責任邊界不清 | 一圖多料號時成本混淆 | 檢查成本表是否只引用 `part_number_id` | 成本 schema 禁止直接掛 `drawing_number_id` 作主關聯。 |
| 同根號錯誤自動關聯 | 只用字串前綴或缺少用途判斷 | OT 圖被誤當 MA 圖 | 自動關聯測試覆蓋 MA / OT | 自動關聯需檢查 `part_root_id` 與 drawing type。 |
| 標準成本被未審核資料覆蓋 | 採購修改直接生效 | 報價或 BOM 成本錯誤 | 成本變更 API 測試 | 採購只能改 draft / pending，主管核准才生效。 |
| 數量級距找不到成本 | 級距缺口或重疊 | 成本試算不穩定 | 級距完整性測試 | 儲存時檢查級距不可重疊，查詢時回明確 blocker。 |
| 圖面改版誤觸成本重審 | 將 revision 與 cost 綁太緊 | 審核負擔增加 | 圖面改版 E2E | 圖面 revision event 不建立成本審核單。 |
| 材質/顏色未填造成一圖多料號不可辨識 | 變體欄位不足 | 採購、製造、品保混淆 | DVT / Release gate | 一圖多料號進 DVT 或 Release 前必填差異欄位。 |

## 13. 驗收標準

- [ ] 圖號模組可看到同主根號下所有料號。
- [ ] 料號模組可看到同主根號下可用 MA 圖與已建立關聯。
- [ ] 同一 MA 圖可關聯多個料號，且料號需保留材質/顏色差異。
- [ ] 成本資料只能以料號為主關聯，不得以圖號作正式成本主關聯。
- [ ] 採購可建立成本 profile 與數量級距，但主管核准前不影響標準成本。
- [ ] 主管可核准成本 profile 與標準成本指定。
- [ ] 標準成本可依基準數量解析到正確級距。
- [ ] 委外、自製、採購等成本情境可並存。
- [ ] 圖面改版不自動建立成本重審。
- [ ] audit log 保留成本異動前後、申請人、審核人與理由。

## 14. 待後續確認

- [ ] 料號流水號是否要把材質/顏色編碼進號碼，或只保留在屬性欄位。
- [ ] 標準成本的預設基準數量，例如 1 pcs、100 pcs 或依料號類型設定。
- [ ] 是否需要限制不同角色可否看到成本金額。
- [ ] 材質與顏色是否先用自由欄位，或第一版即建立字典。
- [ ] 若圖面 title block 寫死材質或顏色，是否允許同一張圖對應不同材質/顏色；若允許，圖面需改為「依料號規格」或建立變體表。
