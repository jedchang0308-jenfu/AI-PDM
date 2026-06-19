# Source Boundary Verification - 2026-05-28

## Scope
Verify generated outputs and dependency installs are excluded from source control while source-level rebuild inputs remain present.

## Checks
- `npm.cmd run qc:source-boundary`: PASS, 18 checks passed.
- `npm.cmd run lint`: PASS.
- `npm.cmd run qc:sw-addin-source`: PASS, 63 checks passed.
- `npm.cmd --prefix cloud-functions/release-handler ci --dry-run --ignore-scripts`: PASS.
- `git status --short --ignored`: only generated/runtime/dependency paths remained ignored after DEV-IND-002 asset relocation.

## Source Boundary
- Ignored and untracked: `.next/`, `node_modules/`, `cloud-functions/release-handler/node_modules/`, `sw-addin/bin/`, `sw-addin/obj/`, `tsconfig.tsbuildinfo`.
- Root dependencies are restorable from `package-lock.json`.
- Cloud Function dependencies are restorable from `cloud-functions/release-handler/package-lock.json`.
- Add-in binaries are generated from `sw-addin/AiPdmAddin.csproj`; source-level checks confirm compile items and output paths.

## Notes
The Cloud Function dry-run emitted an `EBADENGINE` warning because local Node is `v24.12.0` while `cloudevents@8.0.3` declares `>=16 <=22`. The dry-run still passed. Deployment/runtime should use a supported Node version for that dependency set.
