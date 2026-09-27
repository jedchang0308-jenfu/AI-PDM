# ADR-PDM-RELEASE-SOURCE-001：單人維護的正式來源證據

- 日期：2026-09-28
- 狀態：Accepted；provider protection／required CI 尚待讀回
- 來源任務：JENFU/DEV-015；本地子任務：AIPDM/DEV-121#official-source

AI-PDM 由單一維護者管理，不要求第二位 GitHub 帳號或獨立人工 approval。Production owner 接受的來源必須同時有 clean 的官方 `main` 精確 HEAD／tree、唯一 merged PR、該 PR 的 Codex 審查與 QC 紀錄，以及 GitHub provider 讀回的 branch protection：PR 必經、required approving reviews = 0、`DEV-012 Isolated PostgreSQL Cutover` 與 `Production Slice QC` 均為 required checks、管理者同受約束、force push／刪除停用。Verifier 對缺失或 API 拒絕 fail closed；PR／CI／environment／WIF 各自不能單獨證明受保護來源。Codex 紀錄不冒稱人工 review。

此決策只改來源驗證與審查證據，不改 AI-PDM 的資料所有權、migration、runtime、traffic 或既有 release 執行順序。過往 receipt 保留原狀；正式 provider readback 完成前不得宣告新來源 gate PASS。
