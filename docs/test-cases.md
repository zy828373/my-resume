# CS2 Monitor Test Cases

## Automated
- Snapshot writes for different items preserve all rows when executed concurrently.
- Snapshot writes for the same item preserve all rows when executed concurrently.
- Snapshot writes skip unchanged rows inside the minimum interval.
- Snapshot history keeps only the configured maximum rows per item.
- Empty, BOM-prefixed, missing, corrupt, and malformed snapshot JSON recovery paths are covered.
- Config backup fallback covers missing, empty, and damaged primary files.
- Config direct saves, resets, and updates share the same write queue.
- Config validation rejects malformed portfolio holdings before they can overwrite primary or backup files.
- Config and snapshot date validation rejects impossible calendar days before fallback or persistence.
- CSQAQ and CSFloat request timeout covers both the initial fetch and stalled response body reads.
- Config normalization fills missing runtime sections with defaults.
- Token masking never exposes full values.
- Item taxonomy classifies agent, holo sticker, gun skin, and discontinued collection candidates.
- Item taxonomy also covers weapon cases, capsules, expanded autonomous scanner scopes, and generic holo sticker names that must not be treated as target team stickers.
- Recommendation scope normalization ignores invalid values and falls back to defaults.
- Autonomous pool rules cover candidate prefilter hard excludes, scanner scope series enforcement, market-hash/source-label scope matching, gun supply S/D grading, direct high-supply exclusion, CSFloat sample-only listing downgrades, agent core-cap behavior, and non-target sticker rejection.
- Numeric analytics primitives cover clamp, percent change, average/averageLast, standard deviation, moving average, EMA, MACD, and KDJ helpers.
- Analytics coverage includes detail normalization, an `analyzeItem` integration path with mocked history IO, push-signal branches, autonomous recommendation eligibility, scanner-scope recomputation, recommendation cards, and grouped recommendation responses.
- Recommendation hook normalization preserves `scanner.preFilter` diagnostics and `autonomousPool` card decisions, while adding safe legacy and partial-response defaults.
- Scanner utilities reject expired recommendation cache entries and detect current-window candidate shortage before sampling.
- Health response compatibility covers legacy fields and degraded snapshot stats.
- Health polling covers failed polls, overlapping requests, and stale retry state.
- Health polling aborts superseded and disabled in-flight requests.
- Local `.env` loading covers quoted values and non-overriding process environment values.

## Planned
- Runtime-config BOM parsing.
- Analytics normalized detail extraction from varied API payloads.
- Push signal thresholds for entry, watch, and risk scenarios.
- API route-level tests for `/api/config`, `/api/health`, and `/api/items/:goodId/analysis`.
- React page tests for config, health, recommendations, and empty-state rendering.
- API route-level scanner tests for candidate shortage diagnostics without low-quality fallback.
- Per-signal regression tests for unsupported autonomous pool inputs such as precise trade-up EV, full-network inventory, unique sticker craft demand, and team heat.

## Manual Smoke
- Home/watchlist page loads with empty and configured data.
- Market page loads index cards and market analysis.
- Recommendations page renders loading, empty, and populated states.
- Config page masks tokens and source labels.
- Health page shows runtime status, degraded errors, and stale data labels.
