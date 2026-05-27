# CS2 Monitor Backend Patterns

## Source Of Truth
- Shared API contracts live in `shared/types.ts`; `server/types.ts:1` re-exports them for backend imports.
- The API envelope type is defined in `shared/types.ts:1` as `ApiResponse<T>`.
- Backend code should not duplicate common response shapes outside shared contracts (`AGENTS.md:28`).

## Express App Assembly
- `server/index.ts` is the current Express app assembly point (`server/index.ts:87`).
- It wires CORS, local API surface restrictions, and JSON parsing before route handlers (`server/index.ts:88`, `server/index.ts:95`, `server/index.ts:96`).
- `apiRoute` wraps async handlers and forwards rejected promises to Express error handling (`server/index.ts:376`).
- Current API routes are registered in `server/index.ts`; do not document `server/routes/` as existing.
- Keep route handlers thin when adding large behavior; established project rule says large server behavior should move behind services before adding new route logic (`AGENTS.md:29`).

## API Envelope And Error Handling
- Success responses use `jsonOk(data)` to return `{ ok: true, data }` (`server/index.ts:331`).
- Error responses should go through `sendJsonError`, which emits `{ ok: false, error }` with a classified status (`server/index.ts:369`).
- `getApiStatus` handles `ApiError`, `ZodError`, and `status` / `statusCode` fields (`server/index.ts:353`).
- `classifyAnalysisError` maps common analysis/upstream messages to 400, 428, 502, 503, 504, or fallback 500 (`server/index.ts:382`).
- The `/api` error middleware delegates to `sendJsonError`, and the `/api` fallback route emits a 404 envelope (`server/index.ts:3236`, `server/index.ts:3245`).
- There is currently no `server/api-response.ts` helper; do not document it as existing.

## Services Boundary
- `server/services/health.ts` is the current extracted service example: it builds a typed `HealthResponse` from config, refresh runtime, scanner runtime, snapshot stats, and data-source flags (`server/services/health.ts:23`).
- Its focused tests live in `server/services/health.test.ts` (`server/services/health.test.ts:5`).
- Use this as the service boundary style for pure response-building or orchestration-free logic.
- Do not describe broad route/service extraction as completed; major `server/index.ts` route/service splitting requires separate confirmation.

## Stores: Config And History
- `config-store` owns runtime config loading, validation, backup recovery, serialized writes, and atomic persistence (`server/config-store.ts:487`).
- Config writes validate shape, write temp files, rename to primary, then write/rename backup (`server/config-store.ts:528`).
- Config save/update/reset operations share the queue in `enqueueWrite` (`server/config-store.ts:540`).
- `history-store` owns snapshot reading, backup recovery, append semantics, stats, and write serialization (`server/history-store.ts:270`, `server/history-store.ts:307`, `server/history-store.ts:337`).
- Snapshot writes skip unchanged rows inside the minimum interval and trim per-item history (`server/history-store.ts:316`, `server/history-store.ts:323`).
- Red line: do not bypass these stores to write `data/runtime-config.json` or `data/snapshots.json` directly.

## Upstream Clients
- CSQAQ requests use a 1.2s request gap and a 20s default timeout (`server/csqaq-client.ts:14`, `server/csqaq-client.ts:15`).
- Authenticated CSQAQ calls read the configured token and set the `ApiToken` header (`server/csqaq-client.ts:118`, `server/csqaq-client.ts:124`).
- CSQAQ HTTP/status failures become errors with `status` / `statusCode`; 429 gets a specific rate-limit message (`server/csqaq-client.ts:54`, `server/csqaq-client.ts:176`).
- CSFloat uses a 10s default timeout and returns degraded listing summaries instead of failing the whole analysis surface (`server/csfloat-client.ts:4`, `server/csfloat-client.ts:232`).
- Local LLM uses a 60s default timeout, bearer auth, and degraded/disabled fallbacks; LLM output is not a hard decision source (`server/llm-client.ts:29`, `server/llm-client.ts:379`, `server/llm-client.ts:475`).

## Scanner And Runtime State
- Scanner runtime state currently lives in `server/index.ts`, including generation, window position, seen/deep-analyzed IDs, pool, pause/autofill flags, source, errors, and prefilter diagnostics (`server/index.ts:186`).
- Resetting scanner runtime mutates that in-memory state and clears the recommendations cache (`server/index.ts:835`).
- Detail-order candidate loading uses the 6-hour cache interval from `scanner-utils` and is wired through `withCache` in `server/index.ts` (`server/scanner-utils.ts:6`, `server/index.ts:1388`).
- Candidate loading prefers CSQAQ detail order, then records fallback source messages when detail order is unavailable or empty (`server/index.ts:1519`, `server/index.ts:1534`).
- Recommendation routes currently live in `server/index.ts`: read/sync, reset, and continue (`server/index.ts:3016`, `server/index.ts:3069`, `server/index.ts:3101`).
- Do not describe scanner or refresh runtime as service modules; `server/runtime/` does not exist today.

## Analytics Boundary
- `server/analytics.ts` remains the main analytics implementation and imports extracted numeric primitives from `server/analytics/primitives.ts` (`server/analytics.ts:13`).
- Current extracted primitives are stable numeric helpers such as clamp, averages, moving average, EMA, MACD, and KDJ (`server/analytics/primitives.ts:3`).
- Primitive behavior has focused tests in `server/analytics/primitives.test.ts` (`server/analytics/primitives.test.ts:14`).
- Recommendation card building still happens in `server/analytics.ts` and invokes autonomous pool evaluation when needed (`server/analytics.ts:2008`).
- Do not describe analytics normalization/scoring/signals/recommendation/portfolio/LLM modules as existing; broad analytics modularization requires separate confirmation.

## Autonomous Pool Hook
- Candidate prefiltering enters through `prefilterScannerCandidates` (`server/autonomous-pool.ts:198`).
- Applying a pool decision to an `AnalysisResponse` enters through `attachAutonomousPoolDecision` (`server/autonomous-pool.ts:654`).
- Analytics uses autonomous pool decisions when building recommendation cards (`server/analytics.ts:2008`).
- Any hard-rule change that affects `server/autonomous-pool.ts` or the future autonomous pool spec requires separate confirmation under V5.0 section 1.3.
- After `docs/specs/autonomous-pool.md` exists, update that spec before changing recommendation pool behavior.

## Compatibility Rules
- Do not change the `{ ok, data, error }` envelope as routine backend work.
- Do not change `shared/types.ts`, `data/` file shapes, or data write paths without separate confirmation.
- Do not bypass `config-store` or `history-store` for runtime persistence.
- Do not introduce a database, Redis, queue, or new backend service dependency for routine work.
- Do not claim `server/api-response.ts`, `server/routes/`, `server/runtime/`, or additional analytics submodules exist.
- Do not add nonexistent lint, formatter, helper, or tool commands to backend acceptance checks.
