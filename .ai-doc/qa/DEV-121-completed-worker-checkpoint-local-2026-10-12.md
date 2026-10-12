# DEV-121 completed worker checkpoint 本地驗證

日期：2026-10-12；owner：本對話 Root；base official main 1f4f567；branch codex/dev121-completed-worker-checkpoint；native DEV-121#rd-capabilities，不新增主 DEV。

## 因果與最小修正

先前 FAILED DAILY 的原始恢復圖只包含當時完成的 executions。後續 ordinary bootstrap 成功、full descriptor 封存後，新的正常 drain 已存在；下一 source 若仍只用最初集合，會在任何 publication／lifecycle write 前拒絕。缺口是 completed checkpoint 的下游承接，不是可忽略未知 execution 或借用舊 DB admission。

修正只有 generic native reuse／bootstrap 的 closed immutable checkpoint 欄位與既有 full graph consumer 接線。原始 three-ref failure、source/archive、recipe、profile、IAM／Secret、actor、numeric versions、normal template、精確 inventory、fresh normal drain、isolation proof、depth／cycle／hash 和受保護 release guards 保留。current collector 的兩份 provider inventory 逐一核對已驗證 checkpoint execution；歷史 consumer 以封存 body 重建同一精確判斷。

## Synthetic evidence

有限 Node process、port 無、in-memory fake provider；不寫主資料、不呼叫雲端或外部 side effect。既有 canonical dependency 僅以 task-owned Junction 沿用，Root 完成後移除精確 Junction、保留 target。第一次缺依賴為 setup failure，不计 RED；恢復既有 dependency 後，未修改 library 的真實 RED 保留於 ignored private output。

測試先確認 completed execution 沒有 checkpoint ref 時仍精確拒絕、publication 0；帶入有效 checkpoint 後第二 source 成功，新增 fresh drain 1、selftest run 0；full historical replay provider reads 0。第三 source 必須接完整第二 checkpoint 累積圖，較舊 ref 仍拒絕。missing/hash mismatch/partial/unrelated full/wrong credentials/different failure/extra or missing terminal/changed template or status 均拒絕且 association/proof publication 0、lifecycle mutations 0。input 限 own bucket 且 failed-only。

focused 3/3 PASS；完整 native QC 368/368、catalog 3/3、abort 6/6、DB boundary 22檔、app型別與隔離建置 PASS。private logs 只作本地層證據，不是 Production release authority。

## 完成層次

- 本地修正：上述 required gates PASS；independent 6-luna xhigh source QC P0=0／P1=0。
- Production：085 NOT_APPLIED、RD NOT_DEPLOYED；新 source native checkpoint／owner release 待執行。
- 指定兩 fixture RD 编辑／送審／核准拒絕：NOT_RUN，不以舊登入結果替代。
- Dani／Peter 登入、Ctrl+R、仍可使用且同身分：HUMAN_REPORTED_PASS，非 agent observed／新 RD 驗收。
- Google 延遲完成正式情境與指定歷史 parent 刪除：未證；不得擴大清理引用或绕過既有拒絕。

## Required gate 收斂

最終程式與測試 bytes 的 native report：DEV117-S1B-20261012T053419175Z-474A0983；2026-10-12T05:34:19.271Z，LOCAL_CONTRACT／releaseAuthority=false。368/368 regressions、catalog 3/3、abort 6/6、DB boundary 22檔、app typecheck 與隔離建置 PASS；artifact、primary、cleanup=true；雲端／資料庫／流量／憑證／sibling mutations=0。獨立 source QC 核對同一三檔 SHA，P0=0／P1=0，沒有執行雲端或測試。

先前獨立 continuous 307/307 於最後時間鏈 guard 加入前啟動，僅作當時輸入證據；以上 native gates 已涵蓋最終 bytes。一次 QC 執行被中斷且無 report，已確認其 process 不存在才重跑，保留原 log／readback，不算測試失敗。報告後僅追加治理文件，程式及測試 hashes 不變。

本次修改不新增 migration；既有 085 與 RD source 仍需通過自己的正式發布／切流與兩 fixture 驗收，不能以此本地證據替代。