# QA Plan - BOM Auto Draft

Date: 2026-05-26

## Objective

Validate that assembly CAD references submitted with an upload automatically create an Engineering BOM draft.

## Scope

- `cad_references_json` accepted by `POST /api/submissions`.
- `file_references` persistence during submission creation.
- Automatic BOM draft materialization from assembly references.
- Submission detail exposure of auto-created BOM.

## Acceptance Criteria

- Submission creation can accept CAD reference payloads without adding manual engineer fields.
- Assembly component references are saved to `file_references`.
- BOM draft is automatically created during submission creation when assembly component references exist.
- Auto-created BOM preserves child part number, revision, source file, source reference, and quantity.
- `/api/submissions/[id]/bom` returns the auto-created BOM without requiring `materialize=1`.
- Submission detail includes the auto-created BOM.
- Existing BOM manual materialization, permissions, review, release, notification, handoff, auth, and AI regressions remain green.

## Required QC Evidence

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run qc:api`
- API regression must include `BOM-010` through `BOM-013`.
