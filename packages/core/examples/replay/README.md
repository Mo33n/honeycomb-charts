# Replay mode example (**HCP-011**)

Demonstrates **replay-only** wiring: a private full-history buffer and **`setData`** with **`filterEnrichedCandlesAtOrBeforePlayhead`** so the chart never holds bars beyond the playhead (see [`docs/replay-mode-v2.md`](../../docs/replay-mode-v2.md)).

## Versions (this checkout)

| Package | Version / pin |
|---------|----------------|
| **@honeycomb/charts** | See `honeycomb/packages/core/package.json` (this example’s parent package). |
| **lightweight-charts** | **`^5.x`** devDependency in the package; peer **`>=5.0.0`** when published. |

Published hosts should align semver ranges to their lockfile.

## Run

From **`honeycomb/packages/core`** after `npm ci` here:

```bash
npm run examples:dev:replay
```

Default URL: **http://localhost:5184** (Vite).

## Automated proof

**(A)** Puppeteer on the production build of this folder: `npm run test:e2e:replay` (invoked from `npm run verify:all`).
