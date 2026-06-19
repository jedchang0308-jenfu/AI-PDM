# RD Report: SolidWorks Add-in solution and entrypoint

Date: 2026-05-20
Role: RD
Scope: P8 / SolidWorks C# Add-in

## Completed

- Added `sw-addin/AiPdmAddin.sln` so the add-in project can be opened directly in Visual Studio.
- Added `sw-addin/SwAddin.cs` as the `ISwAddin` entrypoint.
- Implemented `ConnectToSW` / `DisconnectFromSW`.
- Registered an `AI PDM` command group in SolidWorks `CommandManager`.
- Added `Login` and `Submit` commands.
- Wired `Submit` flow to existing `AuthService`, `PropertyExtractor`, `FileCollector`, and `SubmissionWindow`.
- Added COM registration helpers for SolidWorks add-in registry keys.

## Design notes

- The add-in keeps the write path narrow. It only invokes the existing authenticated submission flow and does not add any new backend mutation endpoint.
- `Submit` is disabled when there is no active SolidWorks document.
- Missing custom properties and empty file collection are blocked before upload.
- Login is enforced before opening the submission dialog.

## Local validation status

Code-level integration is complete for this slice, but local compilation and real machine registration were blocked by missing host dependencies on this workstation:

- `msbuild` not installed or not on `PATH`
- `dotnet` SDK not installed or not on `PATH`
- `SolidWorks.Interop.*.dll` references not present in the repository `lib/` path expected by `AiPdmAddin.csproj`

Because of those constraints, this round validated source integration only. Build and in-SolidWorks registration must be finished on a Windows machine with Visual Studio Build Tools and SolidWorks interop assemblies installed.

## Next recommended step

1. Restore the SolidWorks interop DLLs under the path expected by `sw-addin/AiPdmAddin.csproj`, or update the project references to the actual installed location.
2. Build `sw-addin/AiPdmAddin.sln` with Visual Studio / MSBuild.
3. Register the compiled add-in on a SolidWorks workstation and verify:
   - Add-in loads on startup
   - `AI PDM` toolbar/menu appears
   - Login dialog works
   - Submit flow validates properties, exports files, and uploads successfully
