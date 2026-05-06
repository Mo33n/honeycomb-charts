# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Viewport segment profiles:** `attachViewportSegmentProfile` wires resize + visible-range → `onViewportWidthCss` with zoom-density mapping, Σweights scaling, and per-bar readability floor; helpers `segmentProfileSelectorWidth`, `zoomEffectiveWidthPx`, `segmentProfileRulesForHostLayout`, `sumTrackWeightsForLayout`, `medianProfileTrackWeightFromRules`, `smallestPositiveProfileBreakpointPx`.
- **Presets:** `ViewportSegmentProfilePresetId` (`default` \| `dense`) and `resolveViewportSegmentProfilePreset`; `attachViewportSegmentProfile` accepts `preset`, optional `scheduleInitialReconcile` (double `requestAnimationFrame` by default when enabled).
- **`createHoneycombChartBinding`** (`lib/chart-binding.mjs`): optional **`viewportSegmentProfile`** attaches the same viewport driver (imports `@honeycomb/charts`), exposes **`detachViewport`** and **`viewport`**, and schedules initial reconcile unless **`scheduleInitialReconcile: false`**.

## [0.1.0] — 2026-05-06

First **npm** release of **`@honeycomb/charts`**: a standalone runtime for footprint-style custom series on [Lightweight Charts](https://github.com/tradingview/lightweight-charts). **`lightweight-charts` >= 5** is a **peer dependency** (not bundled).

### Added

- **Public entry:** `import { … } from '@honeycomb/charts'` — single export surface (`dist/index.js`, `dist/index.d.ts`).
- **Classic column footprint:** `HoneycombSeries` with `HoneycombSeriesOptions`, `defaultHoneycombSeriesOptions`, `mergeHoneycombSeriesOptions`, `honeycombStyleDefaults` (L/R segments, number + bar columns, candle styling, LOD, correction flash, mirror layout).
- **Generic slot engine:** `GenericFootprintSeries` with `GenericFootprintSeriesOptions`, slot roles (histogram, number, ratio, heatmap, bar, candle), themes, bar header/footer lines, optional POC, configurable track spacing.
- **Schema & pipeline:** `EnrichedCandle`, `FootprintLevelRow`, `sanitizeEnrichedCandle`, `FootprintDataAdapter`, `FootprintSeriesBinding`, `applyFootprintLevelPatch` for sparse level updates.
- **Presets & styling:** `FootprintPresetV1` decode/merge, declarative column `colorRules`, brush contract + `runFootprintBrushReducers` and related helpers.
- **Replay helpers:** `deriveFootprintReplayDomain`, `clampFootprintReplayPlayhead`, `filterEnrichedCandlesAtOrBeforePlayhead`, `assertFootprintReplayHasNoFutureBars` (non-finite `time` / playhead throws).
- **Interop:** crosshair / object-id helpers, `buildFootprintLayoutSnapshot`, measurement and bar-scale utilities.

### Naming

- The **custom series class** and **merged options** for the classic engine use the **`Honeycomb*`** prefix (`HoneycombSeries`, `HoneycombSeriesOptions`, …).
- Many **domain types and internals** keep the **`Footprint*`** prefix (`FootprintColumnDef`, `FootprintRenderer`, adapters, brush types, etc.).
