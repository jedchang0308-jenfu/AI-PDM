# Source Boundary Policy - 2026-05-28

## Goal
Keep the repository focused on reviewable source, configuration, deterministic scripts, and quality evidence. Generated output, dependency installs, runtime data, and legacy installer media must stay outside the source boundary.

## Source-Controlled Inputs
- Application source: `src/`
- Automation and QC scripts: `scripts/`
- SolidWorks Add-in source: `sw-addin/*.sln`, `sw-addin/*.csproj`, `sw-addin/**/*.cs`, `sw-addin/**/*.xaml`
- Cloud Function source and lockfile: `cloud-functions/release-handler/index.js`, `package.json`, `package-lock.json`, `.gcloudignore`, `README.md`
- Industrialization evidence and manifests: `.ai-doc/reports/industrialization/`, `.ai-doc/assets/`
- Package lockfiles: `package-lock.json`, `cloud-functions/release-handler/package-lock.json`

## Ignored Generated Outputs
- Next.js output: `.next/`
- TypeScript incremental cache: `tsconfig.tsbuildinfo`
- Root dependency install: `node_modules/`
- Cloud Function dependency install: `cloud-functions/**/node_modules/`
- SolidWorks Add-in build output: `sw-addin/bin/`, `sw-addin/obj/`

## External Assets
Legacy installer and runtime payloads were relocated to `C:\VIBE CODING\.external-assets\AI_PDM\`.

Traceability is maintained by:
- `.ai-doc/assets/external-assets-manifest.json`
- `.ai-doc/assets/external-assets-verification-2026-05-28.md`
- `npm.cmd run assets:verify -- --manifest .ai-doc/assets/external-assets-manifest.json`

## Rebuild Rules
- Rebuild root dependencies with `npm.cmd ci` from `package-lock.json`.
- Rebuild Cloud Function dependencies with `npm.cmd --prefix cloud-functions/release-handler ci` from the function lockfile.
- Rebuild Add-in binaries from `sw-addin/AiPdmAddin.sln` or `sw-addin/AiPdmAddin.csproj`; source-level QC is covered by `npm.cmd run qc:sw-addin-source`.
- Do not commit generated dependency folders, `.next`, Add-in `bin/obj`, or runtime `data/`.

## QC Gate
Run these checks after source-boundary changes:
- `npm.cmd run qc:source-boundary`
- `git status --short --ignored`
- `npm.cmd run lint`
- `npm.cmd run qc:sw-addin-source`
