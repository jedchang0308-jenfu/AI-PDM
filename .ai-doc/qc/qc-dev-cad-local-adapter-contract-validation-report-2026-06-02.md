# QC Fact Report: DEV-CAD-001 Local Adapter Contract

Date: 2026-06-02
Scope: local native CAD extractor adapter contract and probe tooling.

## 驗證結論

通過。本輪只證明 local adapter contract、mock equivalent extractor probe、redaction、path gate 與 extractor missing fallback。正式 SolidWorks Document Manager / equivalent component evidence 仍未 ready，`DEV-CAD-001` 不可整體關閉。

## 執行項目

| 項目 | 實際結果 |
|---|---|
| `npm.cmd run qc:native-cad-extractor-contract` | 14 passed / 0 failed |
| `npm.cmd run qc:document-manager-extractor-probe` | 6 passed / 0 failed |
| `npm.cmd run qc:document-manager-probe-redaction` | 9 passed / 0 failed |
| `npm.cmd run qc:document-manager-probe-path-gate` | 4 passed / 0 failed |

## 實際結果

- External extractor path：metadata detect route 回 HTTP 200。
- External metadata command wins：`drawing_number=QC-EXT-001`。
- External metadata source recorded：`native-adapter` source 存在。
- External reference command returns one reference，quantity = 3。
- Fallback path：未配置 extractor 時 metadata detect route 仍回 HTTP 200。
- Fallback warning 包含 native extractor / Document Manager requirement。
- Probe contract output 位於 `.tmp/document-manager-probes/qc-contract/probe.json`。
- Redaction probe output 不含 simulated secret，且保留 `<redacted>` marker。
- Path gate 會阻擋 missing probe 與 not-ready probe。

## RD 修正事實

- `scripts/qc-document-manager-extractor-probe.mjs` 的 sample / output 改用 `.tmp/...`。
- `scripts/qc-document-manager-probe-redaction.mjs` 的 sample / output 改用 `.tmp/...`。
- `scripts/qc-document-manager-probe-path-gate.mjs` 改讀 `.tmp/document-manager-probes/qc-contract/probe.json` 並用 `.tmp` bad probe fixture。
- `scripts/qc-native-cad-extractor-contract.mjs` 新增 no-extractor fallback branch。

## 問題與阻塞

- `qc:document-manager-report:report` 仍需正式授權元件、部署命令、probe path、sample CAD files 與簽核 evidence。
- 真實 `.sldprt`、`.sldasm`、`.slddrw` metadata/reference 一致性仍待外部測試檔與授權環境。
