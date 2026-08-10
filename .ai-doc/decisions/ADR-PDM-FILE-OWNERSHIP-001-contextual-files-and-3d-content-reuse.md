# ADR-PDM-FILE-OWNERSHIP-001：情境式檔案歸屬與 3D 內容共用

Status: Accepted / Human Confirmed / RD Implementation Ready
Date: 2026-08-10
Owner: Dev PM
Related DEV: `DEV-061` / `DEV-PDM-FILE-OWNERSHIP-001`
Related SPEC: `.ai-doc/specs/SPEC-PDM-FILE-OWNERSHIP-001-contextual-drawing-part-files-and-3d-reuse.md`

## Context

目前圖號與料號各有附件 API，圖面進版又先把檔案上傳到圖號附件庫，再選入送審；正式圖號還同時顯示受控檔案與參考附件管理。使用者必須理解「圖號附件、料號附件、版次包、送審檔案、共用 3D」等儲存邊界，並且相同 3D 可能在不同圖面版次及送審快照中重複保存。

既有系統已具備：

- `file_assets.content_hash` 與 SHA-256 完整性驗證；
- `drawing_revision_packages` 與 `drawing_revision_package_files`；
- `shared_cad_model_versions` 與 `drawing_revision_package_model_links`；
- candidate first-revision file rows與 immutable submission snapshot。

因此真正缺口不是再建立一個附件庫，而是重新定義檔案 authority、送審門檻與共用內容的寫入規則。

## Human Decisions

- `HD-061-01`：既有圖號參考附件沒有保留價值，應刪除，不搬移到料號文件，也不建立歷史附件 UI。
- `HD-061-02`：每次圖面進版仍必須由使用者上傳 3D；系統以內容雜湊偵測其他版本的完全相同檔案，相同時改用共用連結，不保存第二份實體內容。
- `HD-061-03`：所有首版與進版送審一律要求 2D 原始檔及 3D CAD，缺一不可送審。

## Options Considered

### Option A：維持圖號與料號各自完整附件庫

- 優點：沿用既有 API 與 UI。
- 缺點：使用者仍需判斷上傳位置；圖號參考附件、版次檔案與送審檔案持續重疊；相同 3D 容易重複保存。

### Option B：建立全域單一附件中心

- 優點：入口數量表面上最少。
- 缺點：把檔案歸屬選擇轉嫁給使用者；版次、權限、送審與刪除責任更難判斷。

### Option C：資料責任分開，UI 依情境決定歸屬

- 圖面受控檔只從「準備首版／建立新版次」進入版次包。
- 料號只保留長期適用的料號文件。
- 送審引用版次包與 canonical file asset，不建立第三套附件庫。
- 3D 每次仍驗證上傳內容；相同雜湊自動引用既有共用模型與來源資產。

## Decision

採用 Option C。

1. 圖號不再擁有通用參考附件寫入面。正式圖號只讀取受控版次包、目前正式版與歷史版次。
2. 料號保留一個精簡的「料號文件」入口，管理不隨圖面版次同步改變的主文件。
3. 首版與進版使用同一受控檔案門檻：至少一個 `.SLDDRW` 2D 原始檔及至少一個 `.SLDPRT` 或 `.SLDASM` 3D CAD，且各有且只有一個 primary。
4. 3D 上傳先計算 SHA-256，再於同公司、同 part/root authority 範圍尋找 canonical shared model。完全相同時重用既有 `shared_cad_model_versions` 與 `source_file_asset_id`，捨棄暫存內容；不同時才建立新實體資產與新 model version。
5. 新 submission file evidence 採 canonical asset reference 加 immutable hash/pointer snapshot，不複製同一份 3D bytes。
6. 圖號通用參考附件以一次性受控清理移除；任何仍被 candidate、版次包、補件、送審或共用模型引用的資產不得被清理程式視為參考附件。

## Consequences

### Positive

- 使用者只需理解「建立新版次」與「新增料號文件」兩個上傳意圖。
- 圖號畫面不再顯示附件管理、參考附件及已刪除附件。
- 每次進版都能證明使用者重新提供了 3D，同時避免相同內容占用多份儲存空間。
- 版次包、送審快照與共用模型共享同一 canonical 內容來源，追溯與容量口徑一致。

### Trade-offs

- 既有 `2D-only / no 3D impact` 新案例外被取消；歷史資料只保留相容讀取。
- 缺少 2D 或 3D 從 warning 升為 submit blocker，會改變既有送審行為。
- submission file reader、release/download path及清理 guard 必須支援 canonical `source_file_asset_id`。
- production 參考附件清理是不可回復資料操作，必須經 dry-run、備份與 release gate；本文件不授權 live apply。

## Compatibility And Migration

- 已 Released 的版次包、approved supplement、submission snapshot與共用模型全部保留。
- 歷史 `two_d_only` model link 可讀但不可複製成新送審，也不可作為新案 release basis。
- generic drawing attachment POST 退休；既有讀取只供相容顯示受控歷史，不能再建立 loose drawing attachment。
- part attachment API 保留，但產品文案與 UI 改稱「料號文件」。
- 清理腳本必須先輸出 candidate/protected manifest；只 hard-delete 無任何受控引用的 drawing-owned loose file asset。

## Amended Authorities

本 ADR 與相關 SPEC 有意取代下列舊契約：

- `SPEC-PDM-UNIFIED-DRAWING-WORKBENCH-001` 的 `controlled_summary + reference_manager` 並存 UI。
- `SPEC-PDM-DRAWING-REVISION-SUBMISSION-001` 的缺 3D 只警告規則。
- `SPEC-PDM-DRAWING-REVISION-PACKAGE-002` 的 optional-role warning-only 與 drawing attachment library write authority。
- `SPEC-PDM-SHARED-3D-MA-BASELINE-001` 的新案 `2D-only` 例外及「建議重用但仍可重複建立」規則。

其餘圖號／料號身份、FFF、版次比較、審核 authority、Released immutability、latest/history 與權限契約維持不變。

