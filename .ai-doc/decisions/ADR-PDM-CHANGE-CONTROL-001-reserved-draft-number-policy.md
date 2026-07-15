# ADR-PDM-CHANGE-CONTROL-001: 預留草稿號與受控料號回收政策

> 2026-07-13 Amendment：未來候選號 / 正式號邊界改由 `ADR-PDM-NUMBER-STATE-FLOW-001` 與 `SPEC-PDM-NUMBER-STATE-FLOW-001` 接管。送審現在是暫時 `review_locked`，不再自動造成永久不可回收；第一版取消固定 7 天冷卻。正式發布、已作廢 official number、既有 controlled-history 與本文件已完成的 change-control/QC evidence 仍然有效。

日期：2026-06-24
狀態：Accepted for planning
關聯任務：`DEV-PDM-CHANGE-CONTROL-001`
關聯規格：

- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md`

## Context

既有圖料號規格採「表單一建立即占號，號碼不可重用」原則。這對正式受控圖號與料號是正確的，因為作廢、退回、未核准號碼若被重用，會造成 PDM/QMS 追溯混亂。

後續圖號進版與料號替代流程新增了「低摩擦草稿」需求：

- RD 可能先建立新料號草稿，再回到 CAD 圖面修改料號。
- 如果草稿尚未送審、尚未綁定圖面、尚未被 BOM 或替代關聯引用，將它視為正式受控號碼會造成不必要斷號與使用者阻力。
- 使用者明確希望預留草稿號可作廢後回收，但仍要符合稽核需求。

因此需要區分「預留草稿號」與「受控料號」，避免把草稿便利性和正式主資料管制混為同一個規則。

## Decision

採用雙層料號管制：

1. `預留草稿號` 可回收。
2. `受控料號` 不可回收。
3. 新料號先寫入獨立 `part_number_drafts`。
4. 送審或跨越受控邊界後，才轉入正式 `part_numbers` 或建立正式受控關聯。
5. 受控邊界判斷集中於共用 domain service，不分散在各 API route。

### 預留草稿號

定義：尚未進入 PDM 受控關聯的草稿料號。

可回收條件：

- 尚未送審。
- 尚未上傳圖面到 PDM。
- 尚未被 BOM 引用。
- 尚未被替代關聯引用。

作廢後：

- 預設進入 7 天回收冷卻期。
- 建立者本人與料號管理員可選擇立即回收。
- 第一版料號管理員由既有 `pdm_admin` 擔任。
- 一般使用者畫面不顯示該號碼曾被回收。
- 稽核事件仍需保留預留、作廢、回收、重新發出紀錄。

### 受控料號

任一條件成立即視為受控：

- 被 BOM 引用。
- 被替代關聯引用。
- 上傳圖面到 PDM。
- 送審。

受控料號不可回收；作廢、退回、未核准或被取代皆不釋放號碼。

## Alternatives Considered

### A. 全部號碼不可回收

優點：稽核最簡單，與既有 numbering spec 完全一致。

不採用原因：會破壞草稿快速編輯的用意。未進入受控網路的預留號如果不能回收，會造成大量無意義斷號，使用者也會傾向繞過系統先在本機記號。

### B. 全部號碼可回收

優點：最符合使用者對草稿的直覺。

不採用原因：只要號碼曾出現在圖面、BOM、替代關聯或審核紀錄，重用就會造成追溯風險，不符合 PDM/QMS 主資料管制。

### C. 預留草稿號可回收，受控料號不可回收

採用。此方案兼顧低摩擦與稽核需求。關鍵代價是必須明確定義受控邊界，並在回收時即時重檢 BOM、替代關聯、圖面與審核引用。

## Consequences

正面：

- RD 可快速建立、作廢、回收尚未受控的草稿號。
- 正式受控資料仍維持不可重用原則。
- 既有 numbering spec 的不可重用規則保留，但新增明確例外邊界。
- 稽核可用事件紀錄說明草稿號曾被預留與回收，不會污染一般使用者畫面。

代價：

- 需要獨立 `part_number_drafts` 或等效草稿資料模型。
- 需要共用受控邊界 domain service。
- 回收動作必須即時檢查 BOM、替代關聯、圖面與審核引用。
- 舊 numbering spec 必須修訂，否則文件會互相衝突。

## Implementation Notes

- 不得只靠前端判斷號碼是否可回收。
- 回收 action API 必須在同一交易內重新檢查最新受控邊界。
- 受控邊界服務應回傳可讀原因，例如 `referenced_by_bom`、`drawing_uploaded`、`submitted_for_review`。
- 回收後重新發出的號碼不得在一般列表顯示「曾回收」標籤，但管理員稽核視圖可查。
- 既有 `part_numbers` 仍代表受控或正式料號，不承擔可回收草稿語意。

## Superseded / Amended Documents

本 ADR 修訂下列規則的適用邊界：

- `.ai-doc/specs/SPEC-PDM-NUMBERING-001-drawing-part-number-automation.md` 的「號碼不可重用」原則仍適用於受控圖號與受控料號。
- 新增例外：未跨越受控邊界的 `預留草稿號` 可依本 ADR 回收。

## References

- `.ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md`
- `.ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md`
- `.ai-doc/dev_task.md`
