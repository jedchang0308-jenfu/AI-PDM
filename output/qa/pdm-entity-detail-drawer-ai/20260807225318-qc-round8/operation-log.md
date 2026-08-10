# QC Round 8 Operation Log

## Conclusion

- Result: **PASS — authorized read-only UI/contract scope**.
- P0/P1/P2 defects: **0**.
- Canonical local data remained read-only; product writes: **0**.
- Write lifecycle: **Not Executed — Safety Boundary**. This round does not authorize release or claim the destructive write lifecycle gate.

## Gate 0 — Provenance

- Branch / HEAD: `持續優化1` / `f4db2afb0ad7f6cd381de46d8c44597953c834dc`.
- Actor: `張仕杰`.
- URL: `http://127.0.0.1:3000`.
- Viewports: `1440x900`, `1024x768`, `390x844`.
- Final dirty boundary: 68 entries; no product source was edited by QC.

## Gate 1 — Static contract

| Command | Result |
|---|---|
| scoped ESLint | PASS, 0 errors / 0 warnings |
| `qc:pdm-entity-detail-drawer` | PASS 34/34 + exact-target runtime |
| `qc:dev-055:projection` | PASS 57/57 |
| `qc:dev-055:contract` | PASS 13/13 |
| `qc:dev-053:ui` | PASS 23/23 |
| `qc:dev-053:phase1h:ui` | PASS 12/12 |
| `qc:pdm-number-state-flow-ui` | PASS 8/8 |
| `typecheck` | PASS |
| `git diff --check` | PASS; CRLF warnings only |

The focused drawer, projection, typecheck and diff gates were repeated at the final file-hash boundary and remained green.

## Gate 2 — Read-only browser operations

- Hard reload `/numbering/search`; before opening a drawer, A0007 list status was `待你處理 / data_conflict / none`.
- Opened A0007 and waited over two seconds; drawer status was exactly the same. Round 7 P0 contradiction is resolved.
- Sampled A0005 `研發可用 / relation_complete / rd` and A0061 `待你處理 / preparing / none`; list and drawer matched field by field.
- A0007-M01 from search and drawing owner modules matched identity, `等他人處理 / waiting_review / rd`, and core sections.
- A0001-P01 from search and part owner modules matched identity, `待你處理 / preparing / none`, core sections, and body identity duplication count 0.
- Search and parts official/reserved tabs completed Enter round trips with `aria-current=page`; drawings intentionally has no owner tabs and the legacy reserved URL normalized to `view=work`.
- Root primary and `待辦` anchors navigated with Enter.
- A0005-P02 opened exactly with Enter; A0005-P03 opened exactly with Space.
- Focused close X closed with Enter and Space; measured target was `44x44`.

## Gate 3 — Shared shell and safety

- One `role=complementary` drawer, no `aria-modal`.
- Mouse root → drawing and keyboard drawing → part switching kept one drawer and reset content scroll to 0.
- Outside click, Escape and mouse X each closed the drawer.
- Width changed from 380 to 498 px; after reload and reopening it remained 498 px; width was restored to 380 px.
- Candidate cancel confirmation was `role=alertdialog aria-modal=true`; Escape closed only the dialog and kept the candidate drawer. Confirmation was never submitted; writes = 0.

## Gate 4 — UI / text / preview

- Drawing preview showed human fallback text, zero raw runtime strings, zero fake retry controls and 11 download fallbacks.
- Root showed zero internal codes, one deduplicated human reminder and exactly one visible primary CTA.
- Part drawer repeated its identity zero times in the body and preserved the shared section order.
- 1440, 1024 and 390 checks on search, drawings and parts found zero page or drawer-body horizontal overflow.
- Mobile tooltip rect stayed inside the viewport (`x=12`, `right=292`, viewport width 390); close target remained 44x44.
- Mobile drawer scrolling changed drawer `scrollTop` from 0 to 338.4 while page `scrollY` stayed 297.6.

## Gate 5 — Error and UX

- Visible `.inline-error` / non-empty `[role=alert]`: 0.
- Visible HTTP 4xx/5xx, Not Found, Internal Server Error or `/api/` route text: 0.
- Browser console warnings/errors: 0.
- AI UX proxy: 12/12; no zero score; status, next step and risk/recovery each scored 2.

