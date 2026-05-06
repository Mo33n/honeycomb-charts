# Graphics baselines (`honeycomb-charts`)

## Script (T-101 / T-032 / T-033)

```bash
# From packages/honeycomb-charts — requires root `npm run build` + local `npm run build`

# Write **all** scenario PNGs under tests/graphics/baselines/
UPDATE_GRAPHICS=1 npm run test:graphics

# Compare every scenario (fails if pixels differ beyond threshold)
npm run test:graphics

# Regenerate a single scenario (e.g. after changing only bar-column layout)
HC_GRAPHICS_SCENARIO=barColumn UPDATE_GRAPHICS=1 npm run test:graphics

# GenericFootprint heatmap baselines (separate HTML harness)
HC_GRAPHICS_SCENARIO=genericHeatSequential UPDATE_GRAPHICS=1 npm run test:graphics
```

## Scenarios (640×400)

Footprint harness: **`graphics.html?scenario=`** (`graphics-harness.mjs`).

| Baseline PNG | `?scenario=` | Intent |
|--------------|--------------|--------|
| `footprint-default.png` | `default` | Default number + bar columns, candle behind |
| `footprint-bar-columns.png` | `barColumn` | All metrics as **bar** columns (T-032) |
| `footprint-candle-off.png` | `candleOff` | `bodyVisible: false`, `wicksVisible: false` |
| `footprint-z-outline-front.png` | `zOutline` | `candleZOrder: 'outlineFront'` vs default `behind` |
| `footprint-rule-colors.png` | `ruleColors` | Declarative **`colorRules`** on delta number column (HC1-B / RFC D3) |
| `footprint-lod-floor.png` | `lodFloor` | **`lodOmitNumberGlyphs`** + dense levels so number glyphs omit (HC1-C / FR-32) |

Generic harness: **`generic-graphics.html?scenario=`** (`generic-graphics-harness.mjs`).

| Baseline PNG | `?scenario=` | Intent |
|--------------|--------------|--------|
| `generic-heatmap-sequential.png` | `genericHeatSequential` | **`heatmapCell`** sequential + signed Δ number |
| `generic-heatmap-diverging.png` | `genericHeatDiverging` | **`heatmapCell`** diverging on delta |
| `generic-heatmap-value-secondary.png` | `genericHeatValueSecondary` | **`heatmapCell`** `valueSecondary` + `secondaryMetricId` |

Harness lives in **`tests/graphics/fixtures/`**. The static server also mounts e2e fixtures for shared `/lwc.mjs` + `/hc/*` + import map.

## Reviewer process

1. Author runs with `UPDATE_GRAPHICS=1`, attaches changed PNGs + `.diff.png` if compare failed locally.
2. Reviewer approves visual change; baseline PNGs are committed.
3. CI runs `npm run test:graphics` without `UPDATE_GRAPHICS` — must be green.

## Tuning

- **`HC_GRAPHICS_MAX_DIFF`**: allowed differing pixels per scenario (default **8000**) for font/DPR drift on CI.
- **`HC_GRAPHICS_SCENARIO`**: when set, only that scenario runs (compare or update).

If a baseline file is missing, that scenario logs **SKIP** on compare (non-`UPDATE_GRAPHICS` runs) so forks can adopt gradually.
