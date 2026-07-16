# RD Report: Chat Conversation Async Provider Conversion

Date: 2026-06-12

Task: `DEV-SUPABASE-DB-001` Supabase DB runtime migration.

## Scope

This phase converts `/api/chat` LLM conversation and message persistence from synchronous `@/lib/db` helpers to provider-neutral async database access.

Covered runtime behavior:

- create a new `llm_conversations` row for authenticated chat requests without a `conversationId`
- validate existing conversation ownership before continuation
- insert user and assistant `llm_messages`
- update conversation `updated_at` after message insert
- preserve the existing `{ answer, sources, conversationId }` response contract

## Changes

- Added `src/lib/repositories/ai-async-repository.ts` with provider-neutral SQL for:
  - insert LLM conversation
  - select LLM conversation by id
  - insert LLM message
  - update conversation timestamp
- Added `src/lib/ai-async.ts` runtime helper wrapping `AsyncAiRepository` through `getAsyncDatabaseClient(...)`.
- Rewired `src/app/api/chat/route.ts` conversation persistence to use:
  - `createLlmConversationAsync(...)`
  - `getLlmConversationAsync(...)`
  - `addLlmMessageAsync(...)`
- Preserved async auth guard behavior through `requireAuthAsync(...)`.
- Preserved conversation owner denial with `forbidden("Forbidden")`.

## QC Coverage

`scripts/qc-access-control-async-repository.mjs` now includes:

- `AI-CHAT-ASYNC-001`: async AI repository exposes provider-neutral LLM conversation/message SQL without sync DB imports.
- `AI-CHAT-ASYNC-002`: async runtime helper exposes conversation create/get/message operations without sync DB imports.
- `AI-CHAT-ASYNC-003`: `/api/chat` persists conversations through async helpers and no longer imports direct `@/lib/db`.
- `AI-CHAT-ASYNC-004`: in-memory SQLite semantic check proves conversation create/get behavior.
- `AI-CHAT-ASYNC-005`: in-memory SQLite semantic check proves message insert and conversation timestamp update behavior.

## Verification

- `node --check scripts/qc-access-control-async-repository.mjs` passed.
- `npx.cmd tsc --noEmit` passed.
- `npm.cmd run qc:access-control-async-repository` passed 209/209.
- `npm.cmd run lint -- --quiet` passed.
- `npm.cmd run build` passed with the existing Turbopack NFT tracing warning through the chat import trace.
- Minimal HTTP smoke against temporary `next dev` at `http://127.0.0.1:3016` passed:
  - manager login returned 200.
  - first `POST /api/chat` returned a `conversationId`, `answer`, and `sources`.
  - second `POST /api/chat` with the same `conversationId` returned the same `conversationId`.
  - temporary port 3016 listener was stopped and temp logs were removed after verification.

## Boundary

This phase only converts `/api/chat` conversation/message persistence. It does not convert the AI grounding/tooling internals that are still reached through `src/lib/chat.ts`, including AI tool, summary, risk-hint, or other remaining synchronous repository paths.

No Supabase connector call, migration apply, project/branch creation, live Postgres validation, production cutover, or rollback operation was performed in this phase.
