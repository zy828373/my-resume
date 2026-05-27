# CS2 Monitor Handoff

## Purpose
This document is for moving the current project state to another computer or another AI coding session.

Start every new coding session by reading:

- `AGENTS.md`
- `docs/progress.md`
- `docs/architecture.md`
- `docs/test-cases.md`

## In-Session Handoff Token
Use this when context is getting long or another AI needs to continue the same task. Keep it concise and replace placeholders before handoff.

```text
## Handoff Token

### Task Goal
- ...

### Files Read
- AGENTS.md
- docs/progress.md
- docs/architecture.md

### Work Completed
- ...

### Confirmed Conclusions
- ...

### Open Issues
- ...

### Suggested Next Step
- Who should do what next, and which verification commands should run.

### Sensitive Information
- Do not copy tokens, real snapshots, or local absolute paths.
```

## Current Stack
- Frontend: React 19 + Vite 7 + TypeScript.
- Backend: Express 5 + TypeScript + `tsx`.
- Tests: Vitest with V8 coverage.
- Runtime storage: local JSON files under `data/`, intentionally not committed.

## What This Upgrade Added
- Project memory and workflow docs: `AGENTS.md`, `docs/progress.md`, `docs/architecture.md`, `docs/test-cases.md`.
- Safer config and snapshot stores with validation, serialized writes, atomic persistence, backup recovery, and focused tests.
- Shared API contracts in `shared/types.ts`; frontend/server re-export from local type entrypoints.
- Health API/page with stale/degraded handling.
- ECharts lazy loading and chart error retry UI.
- Autonomous recommendation pool v1:
  - deterministic candidate prefilter before sampling;
  - hard excludes for StatTrak, Souvenir, music kits, non-target stickers, active-drop cases, and scope mismatches;
  - analysis-level pool decisions: `candidate_core`, `candidate_low_weight`, `watchlist`, `risk_only`, `excluded`;
  - supply grading and explainable reasons/risk tags/evidence;
  - scanner diagnostics in `scanner.preFilter`;
  - frontend visibility for prefilter counts, candidate shortage, pool labels, supply grade, and risk tags.

## Important Safety Notes
- Do not commit `data/`, `.env`, logs, coverage, `dist/`, or local tool state such as `.claude/`.
- Use `.env.example` as the template. Real API keys stay only in local `.env` or runtime config.
- The reference folder `auto-coding-v2.1 from ...` is intentionally ignored and must not be committed or run against this project.

## Verification Commands
Run these after cloning or after any meaningful change:

```powershell
npm ci
npm exec tsc -- --noEmit
npm test
npm run build
```

For local development:

```powershell
npm run dev
```

Default URLs:

- Frontend: `http://127.0.0.1:5173/`
- Backend API: `http://127.0.0.1:8787/`

## First Setup On Another Computer
Use this to clone the upgraded CS2 monitor branch:

```powershell
git clone --branch cs2-monitor-upgrade https://github.com/zy828373/my-resume csgo
cd csgo
npm ci
Copy-Item .env.example .env
notepad .env
npm exec tsc -- --noEmit
npm test
npm run build
npm run dev
```

Fill `.env` locally with real values such as `CSQAQ_API_TOKEN` and optional `CSFLOAT_API_KEY`.

## Updating An Existing Clone
Use this when the other computer already cloned the repo:

```powershell
cd <EXISTING_REPO_PATH>
git fetch origin
git checkout cs2-monitor-upgrade
git pull --ff-only origin cs2-monitor-upgrade
npm ci
npm exec tsc -- --noEmit
npm test
npm run build
```

## Uploading From This Computer
The GitHub repository currently has an existing independent `main` history, so this upgrade is pushed to a safe branch named `cs2-monitor-upgrade`.

```powershell
cd <REPO_PATH>
git remote add origin https://github.com/zy828373/my-resume
git push -u origin master:cs2-monitor-upgrade
```

If `origin` already exists later:

```powershell
cd <REPO_PATH>
git remote set-url origin https://github.com/zy828373/my-resume
git push -u origin master:cs2-monitor-upgrade
```

Do not overwrite `main` unless the repository owner explicitly confirms that the old GitHub history can be replaced.

## If No Remote Is Available
Create a Git bundle and move it manually:

```powershell
cd <REPO_PATH>
git bundle create csgo-upgrade.bundle master
```

On the other computer:

```powershell
git clone csgo-upgrade.bundle csgo
cd csgo
npm ci
Copy-Item .env.example .env
notepad .env
npm exec tsc -- --noEmit
npm test
npm run build
```

## Quick AI Prompt For The Next Session
Paste this to another AI:

```text
Please first read AGENTS.md, docs/progress.md, docs/architecture.md, docs/test-cases.md, and docs/handoff.md.
Follow the project workflow: user story -> plan -> implement -> verify -> review -> progress update.
Do not commit data/, .env, logs, dist/, coverage/, .claude/, or the auto-coding reference folder.
Use npm exec tsc -- --noEmit, npm test, and npm run build as required verification.
```
