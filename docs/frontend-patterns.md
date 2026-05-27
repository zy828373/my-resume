# CS2 Monitor Frontend Patterns

## Source Of Truth
- Frontend types come from `src/types.ts:1`, which re-exports `shared/types.ts`.
- Do not duplicate backend response shapes in frontend files; use shared types such as `ApiResponse<T>`.
- API contract behavior is documented in `docs/api-contract.md`; frontend code should keep parsing aligned with it.

## Hooks Naming And Responsibilities
- Current domain hooks use `useXxx` names; no `useXxxMutation` pattern exists today.
- Mutation behavior is expressed as callbacks returned by hooks, not separate mutation hooks.
- Examples: `useWatchlist` returns `addWatch` / `removeWatch` (`src/hooks/useWatchlist.ts:22`), `useConfig` returns save handlers (`src/hooks/useConfig.ts:79`), and `useRecommendations` returns refresh / continue / reset callbacks (`src/hooks/useRecommendations.ts:218`).
- Most hooks keep a local `requestJson<T>` helper that parses `ApiResponse<T>`; this is current repetition, not a shared frontend helper (`src/hooks/useRecommendations.ts:83`, `src/App.tsx:49`).
- Hooks expose state plus callbacks using explicit result interfaces when the surface is non-trivial (`src/hooks/useMarket.ts:11`, `src/hooks/usePortfolio.ts:47`).

## App-Level Orchestration
- `src/App.tsx` owns app-wide page selection, message, and error state (`src/App.tsx:356`).
- `App` wires domain hooks together and passes cross-cutting callbacks such as `setMessage`, `setError`, and page activity flags (`src/App.tsx:361`, `src/App.tsx:476`).
- Pages and modals receive already-shaped data and handlers as props instead of fetching their own top-level data; the `AppShell` page composition is at `src/App.tsx:794`, and the `HolderDetailModal` callback wiring at `src/App.tsx:923` is an example of modal-side prop wiring.
- Keep new page-level workflows inside existing hooks or explicit callbacks before adding more state directly to `App.tsx`.

## Pages, Cards, Charts, And Layout
- Existing component layers are `pages`, `cards`, `charts`, `layout`, and `primitives`; do not document or introduce nonexistent directories as established structure. The repository also has `src/components/effects/` for motion utilities and `src/components/Playground.tsx` as a dev-only debug surface (`#playground` hash); neither counts as a business layer.
- `layout` owns the app frame: `AppShell` renders topbar, nav, feedback, optional market strip, and page body (`src/components/layout/AppShell.tsx:25`).
- `pages` compose workflows and state-derived sections. `RecommendationsPage` is prop-driven and handles its local display derivations (`src/components/pages/RecommendationsPage.tsx:71`, `src/components/pages/RecommendationsPage.tsx:150`).
- `cards` hold repeated item panels and page subpanels; recommendation pages compose existing cards instead of embedding all card markup inline (`src/components/pages/RecommendationsPage.tsx:16`).
- `charts` owns `EChartPanel` and option builders, imported through `../charts` where pages need chart rendering (`src/components/pages/WatchlistAnalysis.tsx:2`).
- `primitives` hold small reusable visual building blocks such as `EmptyBox` (`src/components/primitives/EmptyBox.tsx:10`).

## Stale-Response Guard
- Use stale-response guards when requests can overlap, be aborted, or outlive the visible UI.
- Health polling uses `requestIdRef`, `mountedRef`, and an active `AbortController` (`src/hooks/useHealthStatus.ts:43`); it ignores responses whose request id is no longer current (`src/hooks/useHealthStatus.ts:57`).
- Holder drilldown uses request ids plus an abort ref (`src/hooks/useHolderDetail.ts:37`), and returns before committing stale detail responses (`src/hooks/useHolderDetail.ts:69`).
- Search suggestions use a local `active` flag plus `AbortController` cleanup for debounce requests (`src/hooks/useSearchSuggestions.ts:37`).
- Analysis loading guards selected-item writes with `selectedIdRef` before setting analysis or history state (`src/hooks/useAnalysisData.ts:130`, `src/hooks/useAnalysisData.ts:177`).

## Loading, Error, And Empty States
- Hooks expose loading and error state where the UI needs local feedback, for example market analysis (`src/hooks/useMarket.ts:11`) and health status (`src/hooks/useHealthStatus.ts:112`).
- Global success/error banners go through `FeedbackBar`, with error taking precedence over message (`src/components/layout/FeedbackBar.tsx:8`).
- Empty states generally use `EmptyBox` (`src/components/primitives/EmptyBox.tsx:10`), with CSS in `src/styles/primitives.css:216`.
- Recommendation-specific empty panels use `.recommend-empty` markup inside the page (`src/components/pages/RecommendationsPage.tsx:575`) and styles in `src/styles/cards.css:581`.
- Complex pages should keep loading/error/empty UI close to the section that owns the user-visible state.

## ECharts Lazy Loading
- Chart rendering goes through `EChartPanel`; it lazy-loads `./loadEcharts` with dynamic import (`src/components/charts/EChartPanel.tsx:33`).
- `loadEcharts.ts` registers the ECharts core modules, chart types, components, and canvas renderer once (`src/components/charts/loadEcharts.ts:1`).
- Chart option updates call `setOption` through the panel, while `ResizeObserver` keeps the canvas sized to its container (`src/components/charts/EChartPanel.tsx:36`, `src/components/charts/EChartPanel.tsx:40`).
- Chart load failures render an in-panel retry UI (`src/components/charts/EChartPanel.tsx:84`), styled by `.chart-error` (`src/styles/layout.css:240`).
- Pages should import `EChartPanel` and option builders from `../charts`, as in `WatchlistAnalysis` (`src/components/pages/WatchlistAnalysis.tsx:2`).

## Responsive Layout And Text Overflow
- Current layout breakpoints are `1460px`, `1120px`, and `760px` in `src/styles/layout.css:284`, `src/styles/layout.css:308`, and `src/styles/layout.css:373`.
- Responsive grids commonly use `minmax(0, 1fr)` to avoid overflow when columns collapse (`src/styles/layout.css:286`).
- Long market-hash text uses `word-break: break-word` (`src/styles/cards.css:611`).
- Watch card text truncates with `text-overflow: ellipsis` (`src/styles/cards.css:777`).
- Prefer existing responsive class patterns before adding new one-off layout rules.

## Compatibility Rules
- Do not introduce Redux, Zustand, Recoil, Jotai, or another global store as routine frontend work.
- Do not duplicate shared API types or response envelopes in frontend components.
- Do not bypass hooks with ad hoc page-level fetches unless the change explicitly owns that workflow.
- Do not document large `App.tsx` or `RecommendationsPage.tsx` splits as already planned; broad frontend decomposition is a separate-confirmation change under V5.0 section 1.3.
- Do not add nonexistent lint, formatter, store, helper, or directory requirements to frontend acceptance checks.
