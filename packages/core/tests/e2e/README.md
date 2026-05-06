# Footprint E2E (Puppeteer)

## What it covers (T-102)

- Harness loads **`lightweight-charts`** (`/lwc.mjs`) + **`honeycomb-charts`** under **`/hc/*`** (full package `dist/` tree). An **import map** in `fixtures/index.html` maps bare `fancy-canvas` and `lightweight-charts` specifiers for the browser (see `harness-asset-handler.ts`).
- **Cell hover:** `subscribeCrosshairMove` stores the last `objectId`; Puppeteer scans canvas-relative mouse positions until a footprint `fp|…` id appears, then **`parseFootprintObjectId`** validates `metricId` (`bid` / `ask` / `delta`) and **`buildFootprintCrosshairPayload`** with the harness fixture value.
- **Burst** last-bar `update` loop (high-rate path smoke).
- **`retainGap`-style** `setData` with a whitespace slot + following enriched bar (host contract smoke).
- **`retainGap` slot width:** after the two-point smoke, **`measureRetainGapSlotWidths`** loads whitespace + two candles and asserts `timeScale` **logical steps** are 1 and **pixel span** whitespace→first candle matches first→second (within **1.75px**), i.e. one logical slot width is consistent.
- **Partial row patch (v1.1):** after resetting harness data, **`runApplyLevelPatchSmoke`** calls `applyFootprintLevelPatch` on the second bar’s price row and the runner asserts the returned **bid** is **999** (numeric proof the patch path updates series data).

## Run

From repository root, build core (development bundle is enough for local dev):

```bash
npm run build
cd packages/honeycomb-charts
npm run build
npm run test:e2e
```

CI / nightly: same commands; failures usually mean missing `dist/` artifacts or Puppeteer sandbox flags on Linux runners (`--no-sandbox` is already set in the runner).

## Extending

Add scenarios in `fixtures/harness.mjs` and call them from `run-footprint-e2e.ts`. True **cell hover** assertions need stable coordinates from layout; track as follow-up once graphics baselines pin geometry.
