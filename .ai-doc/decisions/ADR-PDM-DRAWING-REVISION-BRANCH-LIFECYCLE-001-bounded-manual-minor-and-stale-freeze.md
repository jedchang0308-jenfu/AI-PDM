# ADR-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001：同主版次手動小版、stale freeze與量產採用語意

Status：`Accepted / Human Confirmed / Local RD-QA-QC Complete / Production Release Gated`

Date：2026-08-25

Owner：Dev PM

Related DEV：`DEV-098`

Related SPEC：`.ai-doc/specs/SPEC-PDM-DRAWING-REVISION-BRANCH-LIFECYCLE-001-unified-revision-and-branch-flow.md`

Decision source：使用者於2026-08-25確認`HD-098-01 = 1C，但必須在同個主版次（整數）下`、
`HD-098-02 = 2A`、`HD-098-03 = 3A`。本ADR以本次明示決策為authority；引用的「真正 Merge 說明」只作語意背景。

## Context

AI_PDM同時存在三個年代的版次／分支語意：

- 舊submission flow提供server建議、人工修改與history backfill。
- 舊sandbox以submission為owner，clone內容後只改狀態卻稱merge。
- 現行canonical Drawing以tuple、predecessor、global claim與最多三條open branch管理工作。

現行canonical candidate只接受server演算法產生的下一個minor／major；stale branch規格又允許沿舊lineage續minor，
而程式可能把current production major與stale suffix混成`1.2 → 2.3`。使用者要求RD可自行設定小版次，
但不能跨越目前整數主版次；同時選擇stale branch凍結，並拒絕把status-only promotion稱為merge。

## Decision

採用以下三項不可分割的產品規則。

### 1. 同主版次下的bounded manual minor

1. 系統推薦版次保留為預設值，但具既有Drawing work建立權限的RD可在同一進版dialog改選`自訂研發小版`。
2. UI只允許輸入minor suffix；major prefix由server依exact non-stale source決定，client不得提交或修改major。
3. 若目前量產基準為`N`，合法自訂target只能是`N.x`；首個production前的pre-production base則只能是`0.x`。
4. `x`必須是無前導零的正整數、可由SQLite／PostgreSQL共同保存，且嚴格大於該source lineage的predecessor minor。
5. 自訂minor可以跳過未使用的小版號，不要求等於演算法建議值；但同company＋Drawing＋tuple必須未建立、未claim且不可重用。
6. server在建立work的同一transaction重新驗證source row version、branch base、current production、predecessor、
   open branch cap與global tuple claim。client輸入只是request，不是版次authority。
7. 自訂minor不需要PDM Manager／System Admin例外權限，也不要求override reason；必須在revision policy snapshot／audit
   保存`selection_mode=manual_minor`、server-derived major、requested minor與policy version。
8. 整數major仍只能由server產生下一個合法production target；RD不得手動輸入、跳號或讓minor成為`Released`。

### 2. stale branch一律freeze

production由其他branch前進後，舊base branch立刻成為derived stale：

- 不再產生minor或major target，也不接受manual minor。
- 可見動作只保留查看、符合條件時申請作廢，以及從目前production建立新branch。
- 新branch不得自動複製舊branch payload，也不得改寫舊branch base／predecessor或產生`2.3`式混合lineage。
- 若工程師要帶入舊成果，Current Phase由人員在新工作中明確整理；系統不宣稱rebase或merge。

`2A`的工程化closure不新增第四項產品決策：freeze自production pointer改變當下生效，不只限制下一次target。系統不得
自動刪除既有work／review／claim／files或approved evidence，而是按handling收斂：

- `owner`：exact workspace改為唯讀，只允許取消本次未核准work；PATCH、檔案、辨識create／decision／rerun／formalize與submit一律409 zero write。stale前已受理的extract可完成evidence，但不得正式化或回寫work payload。
- `review_owner`：reviewer只可退回，核准在進入system前409；退回後owner只可查看與取消。
- `none`：approved-idle branch可查看、申請作廢或從current production建立新branch。
- `system／system_admin／blocked`：另一branch的major adoption必須先409阻擋，直到既有formalization完成或安全收斂；
  不允許production前進後再讓舊system retry寫入。

上述判定全部由同一derived basis resolver執行，不新增persisted stale status。所有Drawing create／update／file／recognition
user mutation／submit／approve／formalize／return／cancel／void transaction固定先鎖Drawing aggregate，再鎖current production、
source state、exact branch、claim／work與recognition session（若有）；basis guard與business write必須同transaction。PostgreSQL不得
對nullable outer join的branch使用`FOR UPDATE`。review退回與owner取消是保留證據的cleanup exception，不代表stale branch可續作。

pre-production同樣fail closed：只有沒有current production、branch base為null且source為canonical `0.x`時，才屬合法
`preproduction`basis；可續`0.y`或由server提出第一個production `1`。其他null basis不得猜成production 0。

### 3. Current Phase不做真正merge

- major target通過審核並原子切換production的動作稱`採用為量產版`。
- UI、API action、audit與狀態不得把status-only promotion稱為`merge／合併`。
- 真正內容merge需要source／target ownership、base-aware diff、conflict resolution、CAD／BOM／file semantics、
  atomic apply、idempotency與recovery；本期不實作，僅保留Future Phase capsule。

## Options Considered

| Decision | Option | Disposition | Reason |
|---|---|---|---|
| 版次輸入 | 只允許server下一個候選 | Rejected | 不符合RD需在同一主版次自行設定小版號的工作方式 |
| 版次輸入 | Manager／Admin例外override＋history backfill | Rejected for Current Phase | 權限層級與使用者指定的一般RD同主版次輸入不符；history backfill另行治理 |
| 版次輸入 | 任意輸入完整major／minor | Rejected | 會破壞major release gate、lineage與global claim |
| 版次輸入 | 同主版次下只輸入minor suffix | Accepted | 保留RD自主性，同時由server固定major與所有一致性不變量 |
| stale branch | 沿舊lineage續minor | Rejected | 長期保留舊基準工作，增加誤用與跨基準解讀風險 |
| stale branch | current major＋舊suffix | Rejected | 產生`2.3`式不明lineage |
| stale branch | freeze後作廢或從current production另開 | Accepted | base、predecessor與production關係最清楚 |
| merge | status-only仍稱merge | Rejected | 介面語意與工程資料事實不一致 |
| merge | Current Phase實作真正內容merge | Rejected for Current Phase | CAD／BOM／附件衝突與回復使scope大幅擴張 |
| merge | 稱`採用為量產版`，不宣稱merge | Accepted | 與現行atomic production promotion一致 |

## Consequences

正面：

- RD可在同一量產主版下自行選擇小版號，不必要求管理員代填。
- major、minor、lineage與production release責任仍由server fail closed。
- stale branch不再產生跨基準混合版次。
- 使用者看到的「採用」與實際資料動作一致，不產生假merge。

成本與取捨：

- candidate／create contract必須支援`recommended`與`manual_minor`兩種selection mode。
- repository不能再以「是否存在於自動候選清單」作為manual minor的唯一合法性判斷；需共用server validator。
- manual minor允許跳號，因此清單排序與比較必須使用tuple，不得把`1.10`當十進位或字串排序。
- stale branch既有可續minor的UI、API、測試與歷史規格必須修訂；既有approved history不改寫。
- 既有work在production前進後不自動丟棄；UI、update、submit、review decision與formalize都需共用basis guard，並提供
  return／cancel／void／restart的完整收斂路徑。
- aggregate-first鎖序會序列化同一Drawing的target與formalization，降低平行度但換取跨SQLite／PostgreSQL一致、
  無雙winner且不產生stale apply。
- 舊history backfill不因本ADR自動開放到canonical Drawing；如需canonical backfill，須另行決策與資料修復gate。

## API／Data／Permission Impact

- 不新增一般RD角色；沿用`numbering.workspace.create`及既有Drawing edit gate。
- target response增加server-derived manual-minor rule；create request使用discriminated selection mode，manual request只帶minor suffix。
- `drawing_revision_claims`的全Drawing tuple唯一性、predecessor與approved不可刪除規則保持。
- `drawing_revisions.policy_snapshot_json`以typed、versioned `revisionTargetPolicy`保存selection mode與server basis；
  `drawing_revision_claims`實體tuple constraint仍是唯一性authority，JSON不得取代claim。
- history backfill、手動major、跨major minor、stale manual minor與minor Released均不獲得新permission或例外入口。

## Migration／Compatibility Impact

- 不修改既有approved revision、claim、branch base、predecessor或artifact。
- DEV-087「candidate只能由server演算法產生」改為「major只能由server產生；minor可由server推薦或由RD提出同主版次suffix，server仍是最終authority」。
- DEV-087「stale branch可沿lineage續minor」由freeze規則有意取代。
- DEV-050的minor release gate、tuple parser與out-of-order controlled history保留；canonical Drawing manual minor不沿用舊submission的完整revision自由輸入。
- production migration、live data repair、deploy與release不由本ADR授權。

2026-08-25 Implementation Readiness note：repo盤點確認現有`drawing_revision_claims`tuple unique constraint與
`drawing_revisions.policy_snapshot_json`足以承接本決策，因此schema classification=`none`、migration=`not required`。
selection evidence採typed/versioned JSON，且核准formalize必須merge保留target policy；這不改變本ADR的domain decision。
exact implementation map、in-flight closure、pre-production resolver與`QA-098-001..031`見配對SPEC §15及
`.ai-doc/qa/qa-dev-098-drawing-revision-branch-lifecycle-validation-plan-2026-08-25.md`。

## Superseded／Amended Documents

本ADR與配對SPEC amendment：

- `.ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-canonical-workbench-state-and-branching.md`的§3.2自動候選唯一性、§4.1第2／3／9項及§9.2 create body邊界。
- `.ai-doc/specs/SPEC-PDM-REVISION-POLICY-002-release-gate-and-suggestion-engine.md`中「偏離建議一律要求override reason」對canonical Drawing bounded manual minor的適用範圍；舊submission flow仍沿用原規則。
- 舊sandbox的status-only merge詞彙與submission-owned branch架構全面退役。

## Re-entry Triggers

下列任一需求出現時，停止並重新做產品／ADR決策：

- 要手動輸入或跳過整數major、跨越目前主版次、允許minor Released。
- 要讓stale branch續作、搬移base、複製payload或自動rebase。
- 要在canonical Drawing建立history backfill、legacy repair或改寫current pointer。
- 要把兩條branch的CAD、BOM、PDF、附件或欄位真正合併。
- 要修改production資料、執行正式migration、deploy或release。
