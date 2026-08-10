# DEV-059 operation log

| Case | Expected | Actual | Result |
|---|---|---|---|
| X | close only top modal | modal 1→0; A0006 drawer and URL unchanged | PASS |
| 返回檢查 | close only top modal | modal 1→0; A0006 drawer and URL unchanged | PASS |
| Escape | close only top modal | modal 1→0; A0006 drawer and URL unchanged | PASS |
| physical CUA click | close without click-through | modal 1→0; no row switch | PASS |
| hard reload | no modal resurrection | modal 0 after reload; drawer readable | PASS |
| back/forward | no modal resurrection | modal 0 on both history transitions | PASS |
| candidate switch | no stale modal state | A0005 opened with modal 0 | PASS |
| locator/physical double-click X | one close, no duplicate action | modal 1→0; A0006 remained selected | PASS |
| viewport 1440/1024/390 | no horizontal overflow or crop | scrollWidth equals viewport width; modal within viewport | PASS |

Shared candidate submit/withdraw mutation was intentionally not executed.
