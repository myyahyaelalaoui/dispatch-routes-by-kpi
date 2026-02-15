# Core Dispatch Algorithm

This package implements KPI-driven route dispatch in pure business logic.

## Data model

- **Team**: `id`, `name`, `dailyCapacity`, optional `capPercent` (defaults to `0.2`), `priorityPostalPrefixes[]`
- **KPIWeek**: `teamId`, `driverScore`, `fda`, `delivery`, `pur`, `noAttempt`, `other`
- **Route**: `routeId`, `postalPrefixes[]`, optional `volume`

## Scoring model (`computeTeamScores`)

Scoring is rule-based and configurable via `ScoringRules`.

- Each KPI has:
  - direction (`higher` or `lower` is better)
  - thresholds (`value -> points`)
  - max points
- Validation enforces total max points across KPIs = **80**.
- Output includes:
  - `totalScore` out of 80
  - per-KPI breakdown with source value, achieved points, and KPI max

## Quota model (`computeQuotas`)

Given teams, KPI scores, and total route volume:

1. Calculate base quota from `dailyCapacity` share.
2. Apply KPI-based boost: `baseQuota * (1 + capPercent * (teamScore / 80))`.
3. Normalize boosted quotas so target quotas sum to total volume.
4. Return `baseQuota`, `targetQuota`, `minQuota`, `maxQuota`.

`capPercent` controls allowed movement around base quota and defaults to `0.2` when not provided.

## Assignment model (`assignRoutesToTeams`)

Greedy assignment algorithm:

1. Sort routes by descending volume.
2. Rank teams per route using:
   - prefix match weight (`priorityPostalPrefixes` vs route prefixes)
   - KPI score tie-breakers
   - quota utilization and overage minimization
3. Prefer teams that stay within `maxQuota`; otherwise pick minimal overage.

Returns both route-level assignments and per-team assigned volume totals.

## Utilities

- `simulateDummyData()` generates deterministic teams/KPIs/routes with a seed.
- CSV exports:
  - `teamScoresToCsv`
  - `quotasToCsv`
  - `assignmentsToCsv`
