# ADR-PDM-ASSEMBLY-MASTER-ENTRY-001：組立件沿用圖號／料號工作臺

狀態：Historical / Superseded in BOM scope by ADR-PDM-BOM-RETIREMENT-001 / 2026-08-28

> Drawing／Part canonical入口決策仍可作非BOM identity原則；任何未來在該入口恢復BOM的內容均已退役，須另立新DEV／ADR。

## Context

既有 `DEV-060` 把組合件辨識、CAD／XLS 來源選擇與 BOM 建立集中在獨立 `/bom/new` 入口。這讓同一個同時具有圖號、料號與 BOM 的組立件，必須離開既有圖號／料號工作臺，並形成第二套 owner、來源與建立語意。

使用者已明確決定拆除這條工作流，先把舊實作與舊資料契約清乾淨，再於未來以既有 canonical 圖號／料號工作臺承接組立件。

## Options

1. 保留 `/bom/new`，只把名稱改成組立件建立。
2. 在圖號／料號工作臺再加一個組立件專用子入口。
3. 不建立組立件專用入口；組立件仍是既有 Drawing + Part identity，`.SLDASM` 與 BOM 是該 identity 的檔案與結構資料。

## Decision

採 Option 3。

- 組立件不具有獨立於 Drawing／Part 的主資料身份或 owner workbench。
- 組立件的建立、進版與檔案操作只可從既有 canonical 圖號／料號工作臺進入。
- `DEV-096` Current Phase把BOM建立／開啟的exact owner action放在料號工作臺Part drawer；Drawing drawer保留檔案與關聯，不在一張Drawing連多個Part時猜測Parent或放第二個BOM action。
- `.SLDASM` 保留為 Drawing revision 的合法 `cad_3d` 檔案；檔案儲存、雜湊共用、預覽與受控下載能力不因本 ADR 退役。
- BOM 保留獨立 Revision、編輯、審核、發行與匯出能力，但不得再以「已偵測組合件」、submission `assembly_component`、CAD reference 或 SolidWorks XLS 建立第二條主資料入口。
- 本輪只做舊工作流 hard retirement，不實作新的 `.SLDASM → 結構差異 → 單次提交` 流程。

## Consequences

- `/bom/new`、其 sidebar／空白狀態 CTA、create-context、`from-assembly` 與 XLS intake 退役。
- 舊 assembly reference 自動產生 BOM、CAD/XLS source authority 與其專用 schema 必須從 active runtime 與 fresh schema 移除。
- 通用 BOM workbench保留讀取、編輯、審核、發行；新的組立件建立流程已由`DEV-096`補到`RD Implementation Ready`，由Part drawer接回exact Part context，並以stable Definition＋explicit applicability取代single owner authority；產品RD尚未開始，capability與production release仍受gate管制。
- 技術移轉包 `DEV-041` 是發行／交接案件流程，不是組立件主資料建立入口，本 ADR 不退役它。
- production migration、資料刪除、deploy 與 release 仍須獨立 release gate；本地實作不得碰主要或正式資料庫。

## Superseded / amended documents

- Intentional replacement：`DEV-060` 的 `/bom/new` 三路徑、組合件來源步驟、`from-assembly` 與 XLS 建立契約。
- Amended：BOM 模組只能保留通用編輯／審核／發行能力，不再擁有組立件主資料建立入口。
- Preserved：Drawing／Part canonical identity、`.SLDASM` 檔案 authority、BOM Revision、技術移轉包與 approval/release authority。
