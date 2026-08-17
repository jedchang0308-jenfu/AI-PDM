# DEV074 RERUN5

- Status: Failed at B02; transferred to RD
- Paths: Pass 6 / Fail 1 / Blocked 0 / Not Run 51
- Open P0/P1: 0 / 0
- Mutation mode: rendered UI only
- W0: five authenticated roles loaded at 1440x900 with zero console errors; unauthenticated protected-route access redirected to login with expected 401 only.
- Failure: A0016 formalization was correct, but the root-detail drawing projection omitted the already-created controlled revision 0.1 and its two file references (`DEV074-R5-P1-001`). RD fixed the root aggregate projection; this historical run remains failed and requires a fresh W0 restart.
