# CS2 Monitor Progress

## Codebase Patterns
- Preserve React 19 + Vite + Express 5 + TypeScript.
- Add tests around pure logic and storage behavior before large refactors.
- Keep API routes compatible while moving implementation behind services.
- Runtime data is local state, not source code.
- Prefer shared API types from `shared/types.ts`.
- New requests should follow the project loop: user story, plan, implement, verify, review, then progress update when project memory changes.
- For substantial work, document risks and acceptance checks before code edits; for risky work, confirm the plan with the user first.
- When the user explicitly requests subagents or parallel review, split review by data, backend, frontend, and tests/docs, then fix and re-verify all accepted findings.
- Autonomous recommendation changes must keep the deterministic prefilter and admission decision explainable: every visible card should carry pool, admission score, supply grade, reasons, and risk tags.

## Upgrade Stories
- US-001 Safety baseline and Git baseline: completed.
- US-002 Project rules and architecture documentation: completed.
- US-003 Vitest setup and core regression tests: completed.
- US-004 Snapshot store serialization and atomic writes: completed.
- US-005 Backend route/service extraction: partial; only health service is extracted. Scanner, refresh, portfolio, and route modules are still in progress.
- US-006 Analytics primitive extraction: partial; numeric primitives are extracted. Scoring, recommendations, holder signals, and LLM fallback are still in progress.
- US-007 Shared API type consolidation: completed.
- US-008 ECharts lazy loading and chunk reduction: completed.
- US-009 Health status API/page: completed.
- US-010 Autonomous recommendation pool prefilter: completed for supported v1 deterministic rules. Unsupported advanced signals such as precise trade-up EV, full-network inventory, unique sticker craft demand, and team heat remain degraded/unsupported policy inputs; broader per-signal regression coverage is still planned.

## Verification Log
- 2026-05-05: Created Git baseline before upgrade work.
- 2026-05-05: Added first upgrade pass and found review issues around config recovery, snapshot backup recovery, health API errors, health page layout, polling, and progress accuracy.
- 2026-05-05: Fixed review findings for config/history recovery, health API compatibility, health page polling/layout/navigation, and progress accuracy. Verified with `npm exec tsc -- --noEmit`, `npm test`, `npm run test:coverage`, and `npm run build`.
- 2026-05-05: Removed the default local LLM bearer value from source and smoke-tested the production build on `http://127.0.0.1:8791/`; navigation, health layout, and browser console/network checks passed.
- 2026-05-05: Fixed second review findings for analysis error status codes, config write queue coverage, malformed snapshot recovery, health polling races, stale health retries, coverage gating, and test-case documentation accuracy.
- 2026-05-05: Fixed follow-up findings for empty snapshot truncation recovery, browser fetch metadata checks, CSQAQ request timeout, config write validation, chart option error handling, shared API response envelope reuse, API 404 envelopes, and local tooling ignore rules.
- 2026-05-05: Fixed review findings for CSQAQ body-read timeouts, auto-refresh scheduling/running races, strict portfolio config validation, non-smoke analytics coverage thresholds, local `.env` loading, and CSQAQ-backed route error status classification.
- 2026-05-05: Fixed strict calendar-date validation, unified health/config and analysis error envelopes, mobile grid overrides, and LAN host configuration guidance.
- 2026-05-05: Fixed follow-up review findings for ordered snapshot retention, per-file store write queues, stricter config ranges, CSFloat timeouts, scanner autofill reset queuing, Host/CORS separation, frontend stale-response guards, Vite backend proxy env sync, and coverage gates for env/upstream clients.
- 2026-05-05: Added the durable new-request workflow to project memory: read docs first, convert substantial work into user stories and plans, implement in small steps, verify with typecheck/tests/build, review changed areas, and update progress when project patterns change.
- 2026-05-05: Added autonomous recommendation pool v1: deterministic candidate prefilter, analysis-level admission scoring, `candidate_core/candidate_low_weight/watchlist/risk_only/excluded` decisions, scanner prefilter diagnostics, frontend pool visibility, and focused tests.
- 2026-05-05: Fixed GPT-5.5 parallel review findings for autonomous pool scope accuracy, sample-only supply evidence, partial frontend pool decisions, scanner recommendation cache expiry, sync autofill waiting, startup scanner generation, window shortage diagnostics, and coverage/test documentation. Verified with `npm exec tsc -- --noEmit`, `npm test`, and `npm run build`.
