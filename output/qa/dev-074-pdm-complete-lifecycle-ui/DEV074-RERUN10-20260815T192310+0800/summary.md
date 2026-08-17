# DEV-074 QC 全量重跑 R10

- 狀態：失敗，已於 B05 停止採計
- 結果：Pass 8 / Fail 1 / Blocked 0 / Not run 49
- 起始：2026-08-15 19:23:10 +08:00
- 原則：R9 修復後從 W0 歸零；58 條只採計 R10 rendered UI 證據；API/DB mutation 皆為 0。
- 失敗：B05 補資料後重新送審，Reviewer 由 UI 核准後申請成為 `apply_failed`，未完成正式化。
- 診斷：B06 與 B08 於停止採計後重現同類錯誤；資料庫唯讀診斷均為 `APPROVAL_SNAPSHOT_STALE`。根因是重複 3D 內容正確共用同一受控資產，但正式化仍錯誤要求資產只能歸屬目前候選版次。
- RD 修復證明：共用資產正式化自動回歸 2/2、typecheck、動作列／狀態投影回歸均通過；Admin 由 UI 重試後 A0014-M05 / A0014-P11 已成為正式資料，成功後返回審核清單且 console error 為 0。
- 結論：修復證明不回填 R10 通過；必須另開 R11 從 W0 完整重跑。
