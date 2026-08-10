# Operation log

All operations were read-only.

1. Opened `/numbering/drawings?view=all` and inspected visible list.
2. Attempted the user-provided candidate URL `candidate:draft-workspace-285395c9-3b51-4837-acc1-103d1399712c`; UI returned `drawing_workbench_row_not_found`.
3. Selected the visible `尚未產生圖號 / 外殼_JF_白鐵_A` row; resolved candidate `draft-workspace-a26e2620-8448-4b68-8de7-0d013f94f31d`.
4. Opened formal `A0005-M01` using the supplied drawing URL.
5. Repeated DOM measurements at `1440x900`, `1024x768`, and `390x844` for candidate and formal.
6. Pressed close `Enter`, `Space`, and `Escape` for both drawers; each closed the drawer and returned to the list.
7. Pressed candidate primary `準備首版圖面` Enter; remained on the candidate URL and kept the drawer open.
8. Pressed formal primary `查看進度` Enter; remained on the formal URL and kept the drawer open.
9. Pressed `A0006-M01` from the list; selected candidate drawer switched in place and retained `drawing_number` family metadata.
10. Opened a mobile status explanation popover; its bounds stayed inside the viewport.
11. Opened candidate cancel confirmation only; verified `alertdialog`, then sent `Escape`; final cancel action was never pressed.
