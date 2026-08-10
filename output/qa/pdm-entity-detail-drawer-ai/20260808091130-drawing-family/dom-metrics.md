# DOM metrics

## Shared contract

Both candidate and formal drawers rendered exactly:

`data-detail-family="drawing_number"`

`data-drawing-detail-skeleton="true"`

`role="complementary"`, with no `aria-modal`; one inline close button; section keys:

`drawing-overview → drawing-revision-files → drawing-preview → drawing-pending → drawing-more`

## Candidate

- entity: `candidate_bundle`
- code: `draft-workspace-a26e2620-8448-4b68-8de7-0d013f94f31d`
- title: `尚未產生圖號`
- subtitle: `外殼_JF_白鐵_A`
- status: `準備候選首版`
- header action: `準備首版圖面` → `#candidate-revision-files`
- revision action: `完成首版圖面`
- close target: `44x44`
- no internal event/identifier words in visible drawer text

## Formal

- entity: `drawing_number`
- code: `A0005-M01`
- title: `A0005-M01`
- subtitle: `馬達_JF_2HP_B`
- status: `等他人處理`
- header action: `查看進度`
- formal capabilities retained: controlled revision files, 2D/3D preview, pending attachments, relations and maintenance links
- close target: `44x44`
- no internal event/identifier words in visible drawer text

## Viewport results

| viewport | candidate drawer | formal drawer | page horizontal overflow |
|---|---|---|---|
| 1440x900 | 420px, x=1008, right=1428 | 420px, x=1008, right=1428 | none |
| 1024x768 | 420px, x=592, right=1012 | 420px, x=592, right=1012 | none |
| 390x844 | 375.2px full-width, x=0, right=375.2 | 375.2px full-width, x=0, right=375.2 | none (`scrollWidth=375`) |

Formal body scroll area: `.pdm-entity-drawer-body` had `clientHeight=752.4`, `scrollHeight=1128`, `overflow-y:auto` at 390x844, proving drawer-local scrolling.

Mobile status popover: x=98, right=378, width=280 within viewport width 390; no clipping.
