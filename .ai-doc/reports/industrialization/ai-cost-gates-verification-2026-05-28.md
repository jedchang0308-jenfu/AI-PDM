# AI/API Cost Gates Verification - 2026-05-28

## Scope
Verify AI assistant behavior avoids unnecessary external LLM calls and logs usage without secrets.

## Implemented Gates
- Local-first routing: deterministic PDM tools answer pending/dashboard/summary, current submission, explicit allowed tools, and policy/rule questions before any external LLM path.
- OpenAI fallback only runs when `LLM_PROVIDER=openai`, `OPENAI_API_KEY` is configured, and local tools cannot answer.
- In-memory cache prevents repeated identical fallback prompts from making duplicate OpenAI calls.
- Per-user rate limit is controlled by `OPENAI_RATE_LIMIT_PER_MINUTE`.
- Context budget is controlled by `OPENAI_MAX_CONTEXT_CHARS`.
- Usage JSONL is controlled by `PDM_AI_USAGE_DIR` and `PDM_AI_USAGE_LOG`; it records provider, model, prompt hash, estimated tokens, cache hit, tool hit, API call, duration, and error reason without raw prompts or API keys.

## Evidence
- `npm.cmd run qc:openai-provider`: PASS, 18 checks.
- `npm.cmd run lint`: PASS.

## Key QC Facts
- `summary` returned through local tools with zero mock OpenAI calls.
- One fallback prompt called mock OpenAI once.
- Repeating the fallback prompt used cache and did not call mock OpenAI again.
- Usage log recorded local, OpenAI API, and cache-hit events.
- Usage log did not include the mock API key or raw prompt.

## Result
PASS.
