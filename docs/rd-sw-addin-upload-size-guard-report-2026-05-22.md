# RD Report: SolidWorks Add-in upload size guard

Date: 2026-05-22
Scope: P1 large file upload limit and error message

## Summary

Added SolidWorks Add-in preflight validation for upload file size.

## Changes

- Added `MaxUploadFileBytes` to `AddinSettings`, defaulting to 50 MB.
- Added pre-upload validation in `ApiClient.Submit`.
- Blocks upload before reading large files into memory.
- Returns a clear message naming the oversized file and configured limit.
- Also blocks missing, empty, or invalid collected files before multipart upload.

## Updated Files

- `sw-addin/Config/AddinSettings.cs`
- `sw-addin/Services/ApiClient.cs`
- `PDM_dev_task.md`

## Verification

Web/API regression remains the source of automated validation in this environment. Add-in compilation and SolidWorks real-machine validation still require a Windows workstation with Visual Studio Build Tools and SolidWorks interop assemblies.
