# CS2 Monitor Engineering Rules

## Stack And Commands
- Frontend: React 19, Vite 7, TypeScript.
- Backend: Express 5, TypeScript, `tsx`.
- Start development with `npm run dev`.
- Validate every change with `npm exec tsc -- --noEmit`, `npm test`, and `npm run build`.

## Task-Type Reading Order
- Philosophy: Favor the smallest reversible step that preserves the current stack, API contract, and local runtime data.
- Every feature or optimization: read `AGENTS.md`, `docs/progress.md`, and `docs/architecture.md` first.
- Test or coverage work: also read `docs/test-cases.md`.
- Handoff, resume, or long-running work: also read `docs/handoff.md`.
- API, shared types, or persistence work: inspect `shared/types.ts`, affected server routes/services/stores, and current callers before planning.
- Frontend work: inspect affected hooks, page components, chart components, and shared types before planning.
- Autonomous recommendation work: inspect `server/autonomous-pool.ts`, `server/analytics.ts`, recommendation UI consumers, and current scanner diagnostics before planning.
- When a relevant `docs/*` contract, spec, or pattern file exists, read it before changing that area.

## Project Boundaries
- Keep the current React/Vite/Express architecture. Do not migrate to Vue, Java, Spring Boot, or MySQL as part of routine work.
- Treat `data/`, `.env`, logs, snapshots, and API keys as local runtime state. Do not commit real credentials or live market snapshots.
- The `auto-coding-v2.1 from ...` folder is reference material only. Do not run its automation scripts against this project.

## Codebase Patterns
- API responses use the `{ ok, data, error }` envelope from the Express server.
- Runtime config writes are serialized and atomically persisted.
- Snapshot writes must go through `history-store`; do not write `data/snapshots.json` directly.
- Shared API contracts live in `shared/types.ts`; frontend and backend should not duplicate common response shapes.
- Large server behavior should be extracted into services before adding new route logic to `server/index.ts`.

## New Request Workflow
- Before acting on a new feature or optimization request, read `AGENTS.md`, `docs/progress.md`, and `docs/architecture.md`.
- Turn substantial requests into user stories or a task plan before implementation.
- For large, fuzzy, or user-facing changes, fill `docs/templates/01-scenario-alignment.md` before implementation.
- Before technical design, fill `docs/templates/02-technical-contract.md` for data, API, state, integration, tests, and compatibility.
- Use grill-me for blocking ambiguity: ask only the questions needed to clear open issues before implementation.
- For each plan, state the target behavior, files likely to change, risks, compatibility constraints, and acceptance checks.
- For large or risky changes, ask for confirmation before editing code.
- Implement in small verifiable steps and keep unrelated refactors out of scope.
- After implementation, run `npm exec tsc -- --noEmit`, `npm test`, and `npm run build`.
- Review the changed area before final response. If the user explicitly asks for subagents or parallel review, split review by data/backend/frontend/tests and reconcile all findings before calling the work done.
- Update `docs/progress.md` when a change alters project status, architecture status, testing coverage, or known patterns.

## Quality Bar
- Add focused Vitest coverage when changing analytics, taxonomy, config, snapshot storage, or shared API contracts.
- Keep public API paths compatible unless the frontend is updated in the same change.
- Prefer small, verifiable changes with clear acceptance criteria.
