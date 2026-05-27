# Autonomous Recommendation Pool v1 Spec

## Purpose And Status
- This spec is the human-readable source of truth for the current deterministic autonomous recommendation pool v1.
- Future pool changes must update this spec first, then code, then focused tests; recommendation hard-rule changes are separate-confirmation work under V5.0 section 1.3.
- LLM output must not participate in pool assignment, hard exclusions, admission scoring, or prefilter diagnostics. LLM may remain auxiliary explanation outside this deterministic path.
- Visible recommendation cards must keep the explainability fields already required by project memory: `pool`, `admissionScore`, `supplyGrade`, reasons, and `riskTags` (`docs/progress.md:12`, `shared/types.ts:68-82`, `server/analytics.ts:2113-2133`).

## Contract Types
- `AutonomousPool` has exactly five literals: `candidate_core`, `candidate_low_weight`, `watchlist`, `risk_only`, and `excluded` (`shared/types.ts:45-50`).
- `SupplyGrade` has exactly six literals: `S`, `A`, `B`, `C`, `D`, and `NA` (`shared/types.ts:52`).
- `AutonomousEvidenceSource` has exactly four literals: `direct`, `text_heuristic`, `sample_only`, and `unsupported` (`shared/types.ts:54-58`).
- `AutonomousRuleEvidence` carries `key`, `label`, `value`, `source`, and `supported` (`shared/types.ts:60-66`).
- `AutonomousPoolDecision` carries `pool`, `admissionScore`, `category`, `supplyGrade`, `optimalGunSupply`, `firstSupplyExclude`, `canEnterEntryScore`, `canEnterAlertScore`, `summary`, `keepReasons`, `downgradeReasons`, `excludeReasons`, `riskTags`, and `evidence` (`shared/types.ts:68-82`).
- `PreFilterDiagnostics` has exactly nine fields: `rawCandidateCount`, `acceptedCandidateCount`, `rejectedCandidateCount`, `sampledCandidateCount`, `candidateShortage`, `shortageReason`, `sampledFromFiltered`, `rejectReasonCounts`, and `poolDistribution` (`shared/types.ts:85-95`, `docs/api-contract.md:34-39`).

## Hard Exclusions
- Candidate prefilter rejects empty candidate text as `EMPTY_CANDIDATE_NAME` with `DATA_INSUFFICIENT` (`server/autonomous-pool.ts:156-161`).
- Candidate prefilter rejects StatTrak, Souvenir, music kits, non-target stickers, and active-drop cases with matching reject reasons and risk tags (`server/autonomous-pool.ts:162-181`).
- Candidate prefilter accepts candidates only when `scopeHint` or text matches the selected scanner scopes; selected holo sticker series are enforced for `holo_team_sticker` (`server/autonomous-pool.ts:184-195`, `server/item-taxonomy.ts:756-797`).
- Analysis-level admission repeats the hard gate for StatTrak, Souvenir, music kits, scanner scope mismatch, non-target stickers, active-drop cases, and gun/covert skins from active-drop cases (`server/autonomous-pool.ts:470-495`, `server/item-taxonomy.ts:741-753`).
- High supply is a first-round hard exclusion when population applies, population is above `70_000`, listing source is `direct`, and listings are above `1_500`; it returns `HIGH_SUPPLY`, `firstSupplyExclude=true`, and pool `excluded` (`server/autonomous-pool.ts:503-518`).
- Active-drop case matching uses the current token list; rare or discontinued case recognition uses the current rare/discontinued token list (`server/autonomous-pool.ts:45-89`). Do not update these lists in this spec-only node.

## 5-Pool Decisions
- The pool list in code mirrors the contract literals and initializes distribution with all five pools (`server/autonomous-pool.ts:37-43`, `server/autonomous-pool.ts:91-99`).
- Hard exclusions call `hardExclude`, which always returns pool `excluded`, score `0`, one exclude reason, one risk tag, and the current evidence array (`server/autonomous-pool.ts:357-375`).
- Non-hard-excluded items map final `admissionScore` to pools as follows: `>=80` is `candidate_core`, `>=60` is `candidate_low_weight`, `>=40` is `watchlist`, `>=20` is `risk_only`, and below `20` is `excluded` (`server/autonomous-pool.ts:316-321`, `server/autonomous-pool.ts:624-650`).
- `canEnterEntryScore` is true only for `candidate_core` and `candidate_low_weight`; `canEnterAlertScore` is true for every pool except `excluded` (`server/autonomous-pool.ts:340-347`).
- `excluded` decisions are not visible in recommendation cards (`server/autonomous-pool.ts:664-665`, `server/analytics.ts:1015-1024`).
- Recommendation list consumption is deterministic: positive cards use `candidate_core` or `candidate_low_weight`, watch cards use `watchlist`, and risk cards use `risk_only` or risk-avoid conditions (`server/analytics.ts:2199-2221`).

## 5-Dimension Admission Score
- The final score is the sum of liquidity, authenticity, price, category fit, and risk scores, then deterministic bonuses/caps are applied (`server/autonomous-pool.ts:561-622`).
- Liquidity is capped at `25`: listings add `7` when `0 < listings <= 1_500` else `3`; supply grade adds `S=7`, `A=5`, `B=3`; 30-day volume adds `7` when `>=10` else `4`; spread adds `6/4/2` at `<=8/<=12/<=20`; buy support adds `5/3` at `>=0.9/>=0.85` (`server/autonomous-pool.ts:561-571`).
- Authenticity is capped at `20`: 30-day volume adds `10`, 7-day volume adds `4`, at least three snapshots add `4`, and absence of `LISTING_ONLY_PUMP` adds `2` (`server/autonomous-pool.ts:573-578`).
- Price is capped at `20`: unknown or `abs(change7d) <= 30` adds `6`; unknown or `abs(priceDeviation30d) <= 20` adds `7`; unknown or `spreadPct <= 12` adds `4`; absence of `PRICE_CHASE` adds `3` (`server/autonomous-pool.ts:580-586`).
- Category fit is capped at `20`: base is `round(hypeFitScore * 0.16)` capped to `16`, then gun skins with optimal supply add `4`, holo team stickers add `4`, operation agents add `3`, and rare/discontinued weapon cases add `4` (`server/autonomous-pool.ts:588-593`).
- Risk starts at `15` and subtracts: `DATA_INSUFFICIENT=5`, `LOW_LIQUIDITY=4`, `WIDE_SPREAD=4`, `WEAK_BUY_SUPPORT=3`, `PRICE_CHASE=4`, `UNSUPPORTED_SIGNAL=3`; result is capped to `0..15` (`server/autonomous-pool.ts:595-602`).
- Final deterministic modifiers: `S` supply adds `5`; `C` supply caps score at `45`; agents cap at `78`; `DATA_INSUFFICIENT` caps at `55`; `UNSUPPORTED_SIGNAL` caps at `59`; combined `LOW_LIQUIDITY` and `WIDE_SPREAD` caps at `35`; final score is clamped to `0..100` (`server/autonomous-pool.ts:615-622`).

## Supply Grade
- Listing count is `direct` when market sell counts are known, `sample_only` when CSFloat is enabled with listing samples, and `unsupported` otherwise (`server/autonomous-pool.ts:243-251`).
- Supply grade is calculated only for `gun_skin` and `covert_tradeup`; other categories use `NA` (`server/autonomous-pool.ts:421-424`).
- Supply grade is `NA` when population or direct listings are missing (`server/autonomous-pool.ts:294-295`).
- `D`: population `>70_000` and listings `>1_500` (`server/autonomous-pool.ts:296`).
- `S`: population `3_000..30_000` and listings `60..600` (`server/autonomous-pool.ts:297`).
- `A`: population `3_000..30_000` with listings `<60` or `601..1_500`, or population `>30_000..70_000` with listings `60..600` (`server/autonomous-pool.ts:298-303`).
- `B`: population `<3_000` with listings `<60`, or population `>30_000..70_000` with listings `601..1_500` (`server/autonomous-pool.ts:304-309`).
- `C`: population `>70_000` with listings `<=1_500`, or population `<=70_000` with listings `>1_500` (`server/autonomous-pool.ts:310-312`).
- `optimalGunSupply` is true only when supply grade is `S`; it is false for non-`S` gun/covert categories and null for other categories (`server/autonomous-pool.ts:421-424`).
- `firstSupplyExclude` is separate from grade display and requires the hard-exclusion condition in the Hard Exclusions section (`server/autonomous-pool.ts:503-518`).

## Reasons, Risk Tags, And Evidence
- `makeDecision` rounds and clamps `admissionScore`, defaults `supplyGrade` to `NA`, defaults `optimalGunSupply` to null, defaults `firstSupplyExclude` to false, deduplicates reasons and risk tags, keeps at most six keep/downgrade/exclude reasons, and keeps at most ten risk tags (`server/autonomous-pool.ts:337-353`).
- Current evidence keys are closed for v1: `category`, `population`, `listings`, `spread`, `buy_support`, and `volume30d` (`server/autonomous-pool.ts:425-468`).
- Current emitted evidence sources are `direct`, `sample_only`, and `unsupported`; the shared contract also permits `text_heuristic`, but this evaluator does not currently emit a dedicated text heuristic evidence row (`shared/types.ts:54-58`, `server/autonomous-pool.ts:425-468`).
- Downgrade risk tags are deterministic: `DATA_INSUFFICIENT`, `SAMPLE_ONLY_LISTINGS`, `LOW_LIQUIDITY`, `WIDE_SPREAD`, `WEAK_BUY_SUPPORT`, `PRICE_CHASE`, `LISTING_ONLY_PUMP`, and `UNSUPPORTED_SIGNAL` (`server/autonomous-pool.ts:521-558`).
- Hard-exclusion risk tags are deterministic: `STATTRAK_EXCLUDED`, `SOUVENIR_EXCLUDED`, `MUSIC_KIT_EXCLUDED`, `SCOPE_NOT_SELECTED`, `NON_TARGET_STICKER`, `ACTIVE_DROP_CASE_EXCLUDED`, `ACTIVE_DROP_CASE_SKIN_EXCLUDED`, and `HIGH_SUPPLY` (`server/autonomous-pool.ts:470-518`).
- Keep reasons are generated only from current deterministic facts: `S` or `A` supply, target sticker category, agent category, rare/discontinued weapon case features, 30-day volume, acceptable spread, and buy support at or above `0.85` (`server/autonomous-pool.ts:604-613`).

## Scanner PreFilter Diagnostics
- Empty diagnostics initialize all nine fields and include a zeroed five-pool distribution (`server/autonomous-pool.ts:101-112`).
- Prefilter diagnostics count raw, accepted, rejected, and sampled candidates; sampled count is initialized to `0` at this stage (`server/autonomous-pool.ts:217-233`).
- `candidateShortage` is true when raw candidates exist but accepted candidates are fewer than `max(1, scanner.randomSampleSize)` (`server/autonomous-pool.ts:217-229`).
- Rejected candidates increment `rejectReasonCounts` by deterministic reason string; rejected rows do not fall back into the sample pool (`server/autonomous-pool.ts:206-214`, `server/autonomous-pool.test.ts:181-201`).
- `poolDistribution` is later merged into diagnostics from autonomous pool evaluation (`server/autonomous-pool.ts:668-688`).
- The API contract must describe the same field names, grouped as counts, shortage fields, and distribution fields (`docs/api-contract.md:34-39`).

## Degraded And Unsupported Signals
- `precise trade-up EV` is unsupported. Current `covert_tradeup` items receive `UNSUPPORTED_SIGNAL` because full EV and output-pool data are absent; this caps admission at `59` through deterministic rules (`server/autonomous-pool.ts:552-554`, `server/autonomous-pool.ts:601`, `server/autonomous-pool.ts:620`).
- `full-network inventory` is unsupported. Current supply uses market listing counts or CSFloat sample counts only; sample-only listings do not trigger high-supply hard exclusion and are tagged `SAMPLE_ONLY_LISTINGS` (`server/autonomous-pool.ts:243-251`, `server/autonomous-pool.ts:528-530`, `server/autonomous-pool.test.ts:314-330`).
- `unique sticker craft demand` is unsupported. Sticker admission currently depends on taxonomy, holo/team/signature checks, selected event series, and the shared scoring inputs; there is no dedicated evidence key for craft demand (`server/autonomous-pool.ts:482-485`, `server/item-taxonomy.ts:779-782`, `server/autonomous-pool.ts:425-468`).
- `team heat` is unsupported for autonomous hard decisions. Recommendation cards may expose analytics-level team scores, but autonomous pool scoring does not read team build or exit scores (`server/autonomous-pool.ts:398-650`, `server/analytics.ts:2106-2107`).
- `authoritative live drop-pool state` is unsupported. Active-drop and rare/discontinued case handling use deterministic token lists and taxonomy flags; missing rare/discontinued confirmation on weapon cases becomes `UNSUPPORTED_SIGNAL` (`server/autonomous-pool.ts:45-89`, `server/autonomous-pool.ts:556-558`).
- These five unsupported inputs must not be written as supported data sources until the data source, type contract, spec change, code change, and tests are all reviewed together.

## Compatibility Rules
- Do not change hard thresholds, downgrade signal lists, hard-exclusion scope, pool literals, supply grade literals, evidence source literals, or prefilter diagnostic fields in routine edits.
- Do not reduce visible-card explainability fields: `pool`, `admissionScore`, `supplyGrade`, reasons, and `riskTags` stay visible and deterministic (`docs/progress.md:12`, `server/analytics.ts:2113-2133`).
- Do not make LLM output a hard-decision input for prefilter, pool assignment, admission scoring, supply grade, or diagnostics.
- Do not claim a `server/autonomous-pool/` directory, an automatic spec-code sync tool, or a new helper exists unless it is actually added in a separately approved code change.
- Any change affecting `server/autonomous-pool.ts`, `shared/types.ts` autonomous contracts, scanner prefilter diagnostics, or this spec must go through scenario alignment and technical contract review first (`docs/templates/01-scenario-alignment.md`, `docs/templates/02-technical-contract.md`).

## References
- Types: `shared/types.ts:45-95`.
- Prefilter entry: `server/autonomous-pool.ts:156-236`.
- Admission entry: `server/autonomous-pool.ts:398-650`.
- Attach decision entry: `server/autonomous-pool.ts:654-661`.
- Visibility and distribution helpers: `server/autonomous-pool.ts:664-688`.
- Recommendation card integration: `server/analytics.ts:2008-2133`.
- Recommendation list split by pool: `server/analytics.ts:2199-2221`.
- Scope and series matching: `server/item-taxonomy.ts:741-797`.
- API diagnostics contract: `docs/api-contract.md:34-39`.
- Current unsupported policy note: `docs/architecture.md:52`, `docs/progress.md:25`.
- Focused v1 regression tests: `server/autonomous-pool.test.ts:180-332`.
