# QC Report: DEV-UX-PLATFORM-001 多角色平台 UX Phase 1A/1B

日期：2026-06-02

## 驗證結論

通過。首頁平台工作台、sidebar 分群、主要頁面流程定位、關鍵空狀態 / 完成狀態下一步 CTA、桌機與手機無水平溢出已驗證。

## 執行項目

- `npm.cmd run lint`：通過。
- `npm.cmd run build`：通過；仍有既有 Turbopack dynamic path / NFT tracing warnings，非本次 UX 變更新增。
- `git diff --check`：通過；僅既有 CRLF warning。
- `npm.cmd run qc:dashboard-quick-access`：16/16 通過。
- `npm.cmd run qc:dashboard-find-first`：16/16 通過。
- `npm.cmd run qc:pdm-numbering-task-center-ui`：22/22 通過。
- `npm.cmd run qc:pdm-numbering-import-center-ui`：22/22 通過。
- `npm.cmd run qc:pdm-numbering-impact-ui`：24/24 通過。
- `npm.cmd run qc:bom-workbench-ui`：35/35 通過。
- `npm.cmd run qc:bom-workbench-review-ui`：32/32 通過。
- Handoff Playwright smoke：16/16 通過，覆蓋桌機 / 手機登入、空結果 CTA、查詢 / 報表連結、水平溢出與 console error。
- Playwright smoke check：首頁 5 張平台工作台卡、6 個 sidebar 分群、水平溢出 0px；上傳頁 mobile 有 1 條流程定位、5 個流程節點、水平溢出 0px。

## 問題與處理

- `qc:dashboard-quick-access` 初次失敗於最近圖號 select 未即時更新；已改為選取圖面時以 `selectedSummary` 同步最近圖號，重跑通過。
- `qc:dashboard-find-first` 初次失敗於首頁搜尋 placeholder 少於既有 metadata 範圍；已恢復完整 placeholder，重跑通過。
- `qc:pdm-numbering-import-center-ui` 初次失敗於空狀態標題「尚未建立 staging 批次」與主區塊「建立 Staging」重複匹配；已改為「尚未產生匯入批次」，重跑通過。
- `qc:pdm-numbering-impact-ui` 初次失敗於完成 CTA 文字與 badge「已套用失效」重複匹配；已改為「完成 / MA 圖作廢已完成」，重跑通過。
- `qc:bom-workbench-review-ui` 初次失敗於 workflow strip「BOM 審核流程」與 H1「BOM 審核」重複匹配；已改為「差異審核流程」，重跑通過。
- build 會清除 `.next` 並破壞執行中的 Next dev server；已在驗證後重啟 `http://localhost:3100`。

## 殘留風險

- 本次未驗證完整自適應任務排序引擎；該範圍已拆為 `DEV-UX-PLATFORM-002`。
- QA/QC 品質工作台仍未產品化，現階段入口以報告、證據與阻塞摘要承接。
