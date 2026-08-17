# DEV-076 authenticated staging browser observations

- Environment: `jenfu-ai-pdm-stg-361825`
- Revision: `ai-pdm-stg-dev07689e802`
- Source commit: `89e8023a7b44fcd08257f7ec226f25b24b6096ba`
- Mode: authenticated, read-only navigation
- Browser console warnings/errors: `0`

| Target | List status | Tree | Matrix | Result |
|---|---|---|---|---|
| A0002 | `關係已建立（尚未生效）` | `A0002-M01 → A0002-P01` | `A0002-P01 × A0002-M01 = 製造` | PASS |
| A0003 | `關係已建立（尚未生效）` | `A0003-M01 → A0003-P01` | `A0003-P01 × A0003-M01 = 製造` | PASS |
| A0004 | `關係已建立（尚未生效）` | `A0004-M01 → A0004-P01` | `A0004-P01 × A0004-M01 = 製造` | PASS |

The old false-empty message `目前沒有可顯示的關係矩陣。` was absent for all three targets.

Cloud Run request logs tied the visible searches to revision `ai-pdm-stg-dev07689e802` and returned HTTP 200 for all three authenticated workbench queries.

Responsive qualification: the exact source commit passed local isolated Chromium at 1440×900, 1024×768, 768×1024 and 390×844 with no page-level overflow. The connected Chrome surface did not apply its advertised viewport override and remained at 1536px, so no false staging multi-viewport claim is made; the live staging portion covers authenticated data/UI/API/console, while the exact-commit isolated run covers responsive rendering.
