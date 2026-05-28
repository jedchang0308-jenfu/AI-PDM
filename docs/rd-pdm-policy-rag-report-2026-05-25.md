# RD Report: PDM Policy RAG

Date: 2026-05-25
Scope: P2 PDM management policy RAG query

## Summary

Added a document-backed policy lookup path for the AI PDM assistant.

## Changes

- Added draft source document `docs/pdm-management-policy-draft.md`.
- Added `scripts/generate-policy-rag.mjs` to build a static policy index.
- Added generated runtime data `src/lib/pdm-policy-rag-data.ts`.
- Added `src/lib/pdm-policy-rag.ts` for keyword retrieval.
- Updated `explain_policy` to return policy snippets with source references.
- Added `policy:rag:build` npm script.
- Added API regression coverage for policy source citation and matched rule content.
- Updated `PDM_dev_task.md`.

## Notes

The source document is explicitly marked as draft. Formal production use still requires management approval of the PDM rules.

## Verification

Recommended local validation:

```powershell
npm.cmd run policy:rag:build
npm.cmd run qc:api
npm.cmd run qc:full
```
