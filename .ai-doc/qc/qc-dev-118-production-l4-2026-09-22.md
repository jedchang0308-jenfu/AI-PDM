# DEV-118 Production L4 checkpoint（2026-09-22）

- Source: `6e21bb4c2f39d4b4777320d202a2037bde609b00`
- Owner run: `35669545522`
- Revision: `ai-pdm-prod-f5ee2af2d7ec`
- Image: `sha256:fee7d3e6f653e29332a77a87ca53fa897b76aed215dcdee54f16fd585fde10bd`
- Traffic: 100%
- Release: ten stages PASS；migration `applied=0 / replayed=15`；DEV-014 conformance PASS

Workspace從Platform normal entry進入AI-PDM未要求第二次登入；reload、帳號管理與`accounts.lifecycle.manage`均PASS，explicit local logout入口在current UI可見。Platform global logout回200後，AI-PDM `/api/auth/me`、`/api/admin/accounts`與`/api/numbering/permissions`均401。

結論：`PDM-W-G`與global invalidation具current evidence。`PDM-W-E`尚缺Workspace工號callback；`PDM-F-G／PDM-F-E`尚缺已核准Cloud Identity Free fixture。故C01／C02四格與DEV-118 full browser acceptance尚未完成。跨app權威細節見Platform `ai-doc/qc/qc-dev-014-production-l4-2026-09-22.md`。
