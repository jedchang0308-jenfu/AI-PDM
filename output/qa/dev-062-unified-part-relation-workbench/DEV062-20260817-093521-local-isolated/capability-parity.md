# DEV-062 capability parity

Run: `DEV062-20260817-093521-local-isolated`

| Legacy capability | Single-page owner | Rendered / server evidence | Result |
|---|---|---|---|
| Part search/filter/select/deep link | PartWorkbench + shared controller | report cases 001-004, race cases, network.json | PASS |
| Candidate view/edit/readiness/submit/progress/correction/history | Shared WorkspaceDrawer mounted by PartWorkbench | candidate drawer browser evidence; Number State Flow Phase 1D aggregate; owner API remains canonical | PASS |
| Formal Part properties/files/drawings/redaction/history | PartDetailContent | formal drawer screenshot; part owner + entity drawer aggregate regressions | PASS |
| Relation tree/expand/matrix/health/blockers | RelationWorkbench | report case 007; blocked screenshot; isolated relation regression | PASS |
| Drawing and Part owner detail handoff | Shared drawer shell + owner content | entity drawer aggregate regression; browser drawer evidence | PASS |
| Relation link/set-primary/set-reference/remove | canonical POST /api/numbering/relations | isolated relation regression with mutation/audit/409 evidence | PASS |
| Candidate overlay/source-less candidate | Relation adapter + shared WorkspaceDrawer | relation-results.json; browser candidate/detail evidence | PASS |
| Back/forward/reload/safe return | shared controller / legacy resolver | report cases 003, 008, 009; network.json; zero-write hashes | PASS |

No capability is accepted from a link count or source fragment alone. Mutation authority evidence is reused from the same local worktree aggregate regressions; DEV-062 adds no mutation endpoint.
