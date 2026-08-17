# DEV074 RERUN6

- Status: failed at W2 C02; RD fix verified locally; full rerun required
- Paths: Pass 13 / Fail 1 / Blocked 0 / Not Run 44
- Open P0/P1: 0 / 0
- Mutation mode: rendered UI only
- W0: five authenticated roles reached the rendered home page with zero console errors; unauthenticated protected-route access redirected to login with expected 401 only.
- W1-A: A01-A04 passed through rendered UI; created new root, drawing-only, three part types, and paired drawing/part request.
- W1-B: B01-B08 passed. B07 waits for the rendered success state before reload; the cancelled workspace reopens as read-only history with no mutation shortcut. B08 two-tab duplicate approval produced one decision/formal result and the approved request is re-fetchable from the rendered all-status view.
- W2: C01 passed. C02 failed because the write-impact modal hid the identity of four blocking candidates and offered no actionable recovery while the footer said all required review was complete.
- RD repair: blocker rows now name the field and scope, localize the reason, and direct the user to set ownership or choose defer/ignore. `qc:dev-068:contract` and `typecheck:app` pass; rendered UI repair evidence is under `screenshots/RD-fix/`.
