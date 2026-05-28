# QA Validation Plan: Dashboard Search Assist and Favorites

Date: 2026-05-27
Scope: PDM_dev_task P2 autocomplete/suggestion and favorite drawings

## User Scenarios

- User types a partial drawing number and sees matching suggestions.
- User clicks a suggestion to open the drawing and complete the search field.
- User marks a frequently used drawing as favorite from the result list.
- User reopens a favorite drawing from the quick access area.

## FMEA Checks

| Risk | Impact | Validation |
|---|---|---|
| Suggestions do not appear | User still needs exact drawing number | Verify suggestion list appears for partial query |
| Suggestion opens wrong record | User may inspect incorrect drawing | Verify clicked suggestion loads seeded submission detail |
| Favorite state is not visible | User cannot tell if a drawing is saved | Verify favorite icon becomes active |
| Favorite chip is not recorded | User cannot return to common drawings | Verify favorite chip appears under `常用圖面` |
| Favorite chip does not restore search | Favorite entry is not actionable | Verify chip fills search with drawing number |

## QC Cases

- `DSA-001` Autocomplete suggestions appear.
- `DSA-002` Suggestion contains drawing number and revision.
- `DSA-003` Clicking suggestion opens drawing detail.
- `DSA-004` Suggestion fills search with drawing number.
- `DSA-005` Favorite button becomes active.
- `DSA-006` Favorite drawing chip is recorded.
- `DSA-007` Favorite chip restores drawing search.

## Acceptance

- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- `npm.cmd run qc:dashboard-search-assist` passes.
