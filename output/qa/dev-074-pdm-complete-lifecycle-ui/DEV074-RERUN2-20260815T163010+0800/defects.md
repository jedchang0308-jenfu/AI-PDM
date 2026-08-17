# DEV-074 Rerun 2 Defects

## DEV074-RERUN2-W0-001：帳號生命週期以瀏覽器 prompt 收集原因

- 等級：P1
- 路由：`/settings/accounts`
- 操作：由帳號清單開啟已離職的 Demo Engineer，點「復職」。
- 實際：Next Runtime Error 顯示 `prompt() is not supported.`；帳號仍為已離職。
- 預期：由可見、可聚焦、可取消的 UI 對話框輸入原因，成功後刷新帳號狀態並留下異動紀錄。
- 證據：`screenshots/W0/W0-account-reactivate-runtime-error-1440x900.png`
- 處置：本 run 停止；退回 RD 修復，修復後建立全新 run。
