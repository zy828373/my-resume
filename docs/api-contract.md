# CS2 Monitor API Contract

## Source Of Truth
- Shared API contracts live in `shared/types.ts`.
- `src/types.ts` and `server/types.ts` re-export shared types for local imports.
- There is currently no `shared/api-envelope.ts` helper; do not document it as existing code.

## Response Envelope
- Success responses use `{ ok: true, data }`.
- Error responses use `{ ok: false, error }`.
- `data` carries the typed payload. `error` carries a readable error message.
- Keep the envelope stable unless the frontend, backend, shared types, and tests are updated in the same confirmed change.

## Frontend Parsing
- Frontend request helpers parse JSON as `ApiResponse<T>`.
- The error branch is `!response.ok || !json.ok`, with `json.error` used when present.
- Hooks may normalize legacy or partial payloads only where current code already does so, such as recommendation scanner diagnostics.

## Error Status Conventions
- `400`: invalid input, Zod validation errors, or bad item identifiers.
- `403`: local API trust checks for address, fetch metadata, origin, or host.
- `404`: unknown `/api` route.
- `428`: required local token or configuration is missing.
- `502`: upstream, fetch, network, or provider HTTP failures.
- `503`: upstream rate limit or retryable provider throttling.
- `504`: timeout conditions.
- `500`: fallback for unclassified server errors.

## Time And ID Conventions
- ISO strings are used for wall-clock fields such as `updatedAt`, `checkedAt`, `lastRunAt`, `nextRunAt`, and scanner timestamps.
- Numeric timestamps are used where shared types already model chart or history points as numbers.
- Keep ID names aligned with shared types, such as `goodId`, `holdingId`, and `taskId`.

## Recommendations Scanner Diagnostics
- `/api/recommendations` may include `scanner.preFilter` as `PreFilterDiagnostics`.
- Count fields: `rawCandidateCount`, `acceptedCandidateCount`, `rejectedCandidateCount`, and `sampledCandidateCount`.
- Shortage fields: `candidateShortage`, `shortageReason`, and `sampledFromFiltered`.
- Distribution fields: `rejectReasonCounts` and `poolDistribution`.
- Frontend normalization preserves these diagnostics and fills safe defaults for legacy or partial responses.

## Compatibility Rules
- Do not change the `{ ok, data, error }` envelope as part of routine work.
- Do not duplicate common response shapes outside `shared/types.ts`.
- Do not write API docs as if nonexistent helpers or tooling already exist.
- Any API contract change that affects `shared/types.ts` requires separate confirmation before implementation.
