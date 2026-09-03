# DEV-004 004-S2 AI-PDM Zero-disruption QC

- 日期：2026-08-31
- 狀態：`Local Complete / Focused QC PASS / Legacy Gates PASS / Production Release Gated`
- 使用者指令：本輪`14A`，S2必須設計成不影響目前AI-PDM使用與開發
- Authority：[Platform DEV-004 direct spec](../../../Jenfu-Management-system/ai-doc/specs/DEV-004-common-iam-app-local-session-implementation.md) §9.3／§9.3.1
- 環境：`local-isolated`；沒有產品server、browser、port、Firebase、Cloud SQL或live principal

## 結論

AI-PDM新增的Jenfu shared-auth adapter預設關閉。`PDM_JENFU_PLATFORM_AUTH_MODE`缺值或`off`時，不需要任何`JENFU_*`設定、不讀OrgMaster active-principal view或central epoch，且只接受既有PDM session v2；`on`時只接受與v2格式互斥的Jenfu v1 app-local session，並只從`__session`／`pdm_session`讀取，不接受Firebase ID token或任意Bearer作business session。

本輪沒有修改`users`、`platform_principal_mappings`、`account_session_records` schema、既有Firebase UID、`pdm_user_id`、role、permission或local dev entrypoint。沒有執行production migration、deploy或release。

## Evidence

| Gate | 結果 |
|---|---|
| Contract SHA／fixture／decision code／drift self-test | PASS；SHA=`4d27c1e297b516207f931f57e443ecda99e260c56369132f9a269d11920cda96` |
| S2 focused runtime | 14／14 PASS；fresh evidence=`output/qa/dev-004/DEV004-S2-20260831T030530606Z/` |
| DEV-046 isolated auth runtime | 12／12 PASS |
| DEV-046 full | 16／16 PASS |
| Employee login alias | 21／21 PASS |
| `typecheck:app` | PASS |
| `lint` | PASS；0 error、5 existing navigation warnings |
| `build:isolated` | PASS；artifact=true、primary=true、cleanup=true |
| Temporary data roots | focused／regression／typecheck／lint task roots皆已釋放；build runner cleanup=true |

## Gate Closure

1. `DEV046-2B-010`：保留歷史`config/platform/staging-preflight.template.json`追溯性；runner改驗證檔案不存在，或保留時必須同時為`local-static-only`、resource／credential／Terraform apply／billing mutation全部關閉。fresh結果PASS。
2. `DEV046-ALIAS-019`：runner改驗證現行`isAllowedRequestOrigin`匯入、guard及403拒絕，同時保留verified UID後consume ordering與`no-store`檢查。fresh結果PASS。

本次只修改兩支QC runner，沒有修改產品程式、`config/platform/staging-preflight.template.json`、schema、資料或部署。兩個既有驗證例外已從根因關閉，S2判定為`Local Complete`。

## Fail-seeking coverage

- default-off與有效on preflight
- cookie-only；Bearer-only request取不到shared session
- legacy v2與Jenfu v1雙向互斥
- active-principal exact 1筆通過；0筆與2筆拒絕；SQL使用`FETCH FIRST 2 ROWS ONLY`且無`LIMIT 1`
- central epoch連續呼叫實際重讀，無跨request positive cache
- exchange保留case-sensitive Firebase UID與既有`pdm_user_id`
- 每個protected request重查PDM lifecycle、local session registry、active employee與epoch
- epoch直接變更後下一request立即回`auth_epoch_stale`
- local session registry missing／revoked fail closed

## 下一步

- S3 OrgMaster BFF與S4 Platform auth shell可依direct spec獨立派工；S5必須等S3～S4全部通過。
- 任一production Firebase／Cloud SQL／Secret Manager／DNS／deploy／release需求，另進release gate。
