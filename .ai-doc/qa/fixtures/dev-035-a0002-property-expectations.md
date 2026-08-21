# DEV-035 A0002 SolidWorks Property Expectation

狀態：`Fixture Confirmed by Real Reader / Local QA-QC Passed`
日期：2026-08-19
用途：固定 deterministic mapping expected value 與 conditional real-file acceptance；本文件不是 SolidWorks 檔案、不是 extractor輸出，也不可被當成real reader成功證據。

## Controlled source identity

| Role | File | FileAsset | Bytes | SHA-256 |
|---|---|---|---:|---|
| 3D | `A0002.SLDPRT` | 每次由受控session解析，不在fixture固定DB ID | 495749 | `15cd458b983e4dddd0836555dfa8eac0f4d3ac87c056403d4279ebbf3d3ec7f4` |
| 2D | `A0002-M01.SLDDRW` | `FA-6736...`（執行時由受控session重新解析完整ID） | 295934 | `e664...`（執行時以受控source snapshot完整值為準） |

縮寫只供開發文件辨識；QA manifest必須從session/file_assets讀回完整ID/hash，不得以本文件縮寫作比較輸入。

## Expected mapped properties

| Raw property | Expected value | stable key | category | owner/write policy |
|---|---|---|---|---|
| `品名` | `本體_BS_右_Xx5` | `part_name` | `identity_relation` | A0002-P01 / evidence only |
| `3D圖號(主)` | `A0002` | `model_root_number` | `identity_relation` | drawing / evidence only |
| `版本／版次` | `0.1` | `revision` | `identity_relation` | drawing revision / evidence only |
| `製圖` | `朱宇鴻` | `drawn_by_name` | `drawing_revision` | drawing revision / reviewed metadata write |
| `料號` | `A0002-P01` | `part_number` | `identity_relation` | exact linked part / owner anchor / evidence only |
| `材質` | `不鏽鋼SUS304` | `material` | `part_attribute` | exact linked part / reviewed write |
| `表面處理` | `無` | `surface_finish` | `part_attribute` | exact linked part / reviewed explicit value |
| `熱處理` | `無` | `heat_treatment` | `part_attribute` | exact linked part / reviewed explicit value |

## Interpretation rules

- 實際 property 位於document或configuration scope由reader evidence決定；fixture不可預先捏造configuration。
- `料號` 是同scope part-owner anchor；若實檔scope與本假設不同，QA記錄actual scope並依SPEC owner rules判定，不可為了match expected手動重排。
- `無` 是實際字串值，可提出explicit value；空字串／null不是`無`。
- linked property的candidate優先採檔案上次儲存的evaluated value，raw evidence另保留linked expression。若Document Manager把未連結literal放在raw／linkedTo channel且evaluated為空，只可採非`$PRP` expression的非空literal；未解析expression維持null／blocked。
- `品名/3D圖號(主)/版本/料號`不得正式化改寫canonical identity。
- `製圖`是name string，不解析為account/user id。
- SOLIDWORKS 未儲存狀態不在本fixture或DEV-035驗收範圍。

## Confirmed real-reader evidence — 2026-08-19

- Two independent sessions：`recognition-7e08788c-9e47-4962-bebd-05f0fc4b29c3`、`recognition-376da831-c73e-4a86-bdaa-c6b41546b880`。
- Reader：`solidworks-document-manager.v1`；兩次皆`succeeded`且各14 observations。
- Document scope：`品名`、`3D圖號(主)`、`版次`、`製圖`；configuration scope（`展開`／`彎折`）：`料號`、`材質`、`表面處理`、`熱處理`。
- Part owner：draft part `A0002-P01`；drawing／drawing revision owners均由target context解析成功。
- 八個stable key的non-empty value、owner與scope可重現；document-level空`表面處理`仍保留blocked evidence，不等同`無`。
- Sanitized artifact：`output/qa/dev-035-solidworks-native-reader/20260819T120907Z/a0002-real-reader.json`。
