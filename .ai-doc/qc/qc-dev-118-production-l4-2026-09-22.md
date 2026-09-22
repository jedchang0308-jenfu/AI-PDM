# DEV-118 Production L4 checkpoint（2026-09-22）

- Source: `6e21bb4c2f39d4b4777320d202a2037bde609b00`
- Owner run: `35669545522`
- Revision: `ai-pdm-prod-f5ee2af2d7ec`
- Image: `sha256:fee7d3e6f653e29332a77a87ca53fa897b76aed215dcdee54f16fd585fde10bd`
- Traffic: 100%
- Release: ten stages PASS；migration `applied=0 / replayed=15`；DEV-014 conformance PASS

Workspace從Platform normal entry進入AI-PDM未要求第二次登入；reload、帳號管理與`accounts.lifecycle.manage`均PASS。Platform global logout回200後，AI-PDM `/api/auth/me`、`/api/admin/accounts`與`/api/numbering/permissions`均401。AI-PDM explicit local logout亦已實際執行：`POST /api/auth/logout`=200，導向`/login?reason=local-logout`，其後auth／accounts／permissions均401；再按「使用鉦富平台登入」時，AI-PDM start／callback及Platform authorize均303，回到AI-PDM後auth／permission=200，沒有第二次Google或工號提示。

Workspace `JFS0005`工號起手亦已完成Google callback、Platform session、AI-PDM handoff／reload與管理權限。Cloud Run logs在current Platform revision讀回`POST /api/auth/login-intents`=201、`POST /api/auth/firebase/session`=200、`GET /api/auth/me`=200；current AI-PDM revision的`GET /api/auth/me`、`/api/numbering/permissions`及`/api/admin/accounts`均200。`PDM-W-G`、`PDM-W-E`與global invalidation具current evidence。Google Admin唯讀盤點確認現有7個有效使用者都同時具有Workspace Business Standard與Cloud Identity Free，沒有Free-only／無Gmail fixture，因此`PDM-F-G／PDM-F-E`及negative／rate／race cells仍未執行。故C01／C02四格與DEV-118 full browser acceptance尚未完成。跨app權威細節見Platform `ai-doc/qc/qc-dev-014-production-l4-2026-09-22.md`。
