# `honeycomb-charts` examples (Vite)

From `packages/honeycomb-charts` after a repository root build (`npm run build` or `npm run build:prod`) and `npm install` in this package:

```bash
npm run examples:dev
```

Then open the URL Vite prints (default **http://localhost:5180**).

**Versions (dev):** this monorepo pins **`lightweight-charts`** via `file:../..` in `package.json`; the **`honeycomb-charts`** API is imported from `src/` through Vite aliases. Match published semver to your host app when not using the fork.

| Example   | Entry / notes                          |
| --------- | -------------------------------------- |
| **Minimal** | `examples/minimal/` — Path A: **`setData`** with **24** footprint bars (`npm run examples:dev`). Append **`?mirror=1`** for **`layoutDirection: 'mirrorSegments'`** (HC1-041). |
| **Path B** | `examples/path-b/` — `FootprintSeriesBinding` + `FootprintDataAdapter` + `series.update` from RAF flush (`npm run examples:dev:pathb`, port **5181**) |
| **Brush** | `examples/brush/` — v1.2 **`filterBarsByFootprintBrush`** + **`runFootprintBrushReducers`** against static ranges (`npm run examples:dev:brush`, port **5182**). |
| **Session bands** | `examples/session-bands/` — host DOM band aligned with **`timeScale().timeToCoordinate`** (`npm run examples:dev:session`, port **5183**). Footprint column width unchanged. |
| **Replay** | `examples/replay/` — **replay-only** `setData` via **`filterEnrichedCandlesAtOrBeforePlayhead`** (`npm run examples:dev:replay`, port **5184**). Normative contract: [`docs/replay-mode-v2.md`](../docs/replay-mode-v2.md). |
| **Static dataset** | `examples/static-dataset/` — fixed **`EnrichedCandle`** pool + **`chart-display-config`** (default **20** visible bars; `?bars=` / `?slice=`) (`npm run examples:dev:static`, port **5185**). |
| **Generic footprint (LWC)** | `examples/generic-footprint/` — **`GenericFootprintSeries`** custom series (**24** bars): vol hist \| Δ/vol \| Δ hist + mini OHLC (`npm run examples:dev:generic-footprint`, port **5188**). See [`generic-footprint/README.md`](./generic-footprint/README.md). |
| **Custom canvas** | `examples/custom-canvas/` — **standalone canvas** demos (not LWC): **`CanvasHost`** + **`CanvasScene`** registry; **butterfly**, **number_bar**, **footprint_generic** (declarative slots + layout + renderer) (`npm run examples:dev:canvas`, port **5187**, `?demo=`). See [`custom-canvas/README.md`](./custom-canvas/README.md). |

ASCII (session overlay): the tinted band is a **sibling** `div` over the chart, not inside the footprint series:

```
 pane
┌──────────────────────────────────────────┐
│ chart (canvas)                    │band│  ← `#band` left/width from UTC session window
│ HoneycombSeries                     │████│     (teal strip moves on zoom / visible range)
└──────────────────────────────────────────┘
```

Add further examples under `examples/<name>/` and list them here.
