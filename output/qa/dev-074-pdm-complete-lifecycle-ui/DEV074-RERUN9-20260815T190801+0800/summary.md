# DEV-074 QC 全量重跑 R9

- 狀態：B03 失敗後停止；RD 已修復並以 rendered UI 驗證，必須由 W0 全量重跑
- 起始：2026-08-15 19:08:01 +08:00
- 原則：R8 修復後從 W0 歸零；58 條只採計 R9 rendered UI 證據；API/DB mutation 皆為 0。

- 結果：Pass 7 / Fail 1 / Blocked 0 / Not Run 50。
- 失敗：圖號統一工作台的送審／撤回動作直接執行，未經共用確認視窗，B03 無法取消。
- RD 修復：圖號工作台已和料號／圖料工作台一致，所有候選狀態 mutation 先進共用 `ConfirmDialog`；按「返回檢查」不送出 POST 且維持可送審。`typecheck` 與 DEV-059 UI 契約 10/10 通過。
