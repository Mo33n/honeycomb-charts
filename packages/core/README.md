# `@honeycomb/charts`

Footprint (order-flow style) **custom series** for [Lightweight Charts](https://www.tradingview.com/lightweight-charts/). Published as **`@honeycomb/charts`** with a **peer dependency** on `lightweight-charts` (see repo docs for RFC / ADR history).

## Documentation

- [PRD-footprint-charts.md](../../PRD-footprint-charts.md)
- [RFC-footprint-charts-implementation.md](../../RFC-footprint-charts-implementation.md)
- [ADR-0001-footprint-honeycomb-charts.md](../../ADR-0001-footprint-honeycomb-charts.md)
- [TASKS-footprint-honeycomb-charts.md](../../TASKS-footprint-honeycomb-charts.md) (MVP)
- [TASKS-footprint-honeycomb-v1.1.md](../../TASKS-footprint-honeycomb-v1.1.md) · [v1.2](../../TASKS-footprint-honeycomb-v1.2.md) · [v2+](../../TASKS-footprint-honeycomb-v2.md)
- [Replay mode v2 (HCP-010)](./docs/replay-mode-v2.md) · [Ghost overlay v2](./docs/ghost-overlay-v2.md)
- [Release checklist (T-112)](./docs/release-checklist.md)
- [Partial level updates v1.1 (HC1-010)](./docs/partial-updates-v1.1.md) — `applyFootprintLevelPatch`
- [Rule-based column colors v1.1 (HC1-B / RFC D3)](./docs/rule-colors-v1.1.md) — `colorRules` on `FootprintColumnDef`
- [LOD number glyphs v1.1 (HC1-C / FR-32)](./docs/lod-v1.1.md) — `lodOmitNumberGlyphs`
- [QA checklist v1.1 (HC1-041)](./docs/qa-footprint-v1.1.md) — RTL mirror (`?mirror=1` on minimal example)
- **Peer / upstream API:** [Lightweight Charts documentation](https://tradingview.github.io/lightweight-charts/) (custom series + time scale; this package targets **`lightweight-charts` ≥ 5** per `package.json`).

## Install & build

See [BUILDING-HONEYCOMB.md](./BUILDING-HONEYCOMB.md).

**GitHub / npm consumers:** see [PUBLISHING.md](./PUBLISHING.md) for install specifiers and subpath imports (`/chart-binding`, `/catalog`, …).

## Attribution

This package is part of a fork of TradingView Lightweight Charts. Per Apache-2.0, retain `NOTICE` / license attribution and avoid implying endorsement by TradingView.

## API sketch

```ts
import { createChart } from 'lightweight-charts';
import { HoneycombSeries, defaultHoneycombSeriesOptions } from '@honeycomb/charts';

const chart = createChart(container);
const series = chart.addCustomSeries(new HoneycombSeries(), defaultHoneycombSeriesOptions);
series.setData([
  {
    time: 1710000000,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    levels: [
      { price: 100, values: { bid: 120, ask: 80, delta: 40 } },
      { price: 101, values: { bid: 50, ask: 90, delta: -40 } },
    ],
  },
]);
```

## RTL / v1.1

MVP ships **`layoutDirection: 'ltr'`** only. Segment mirroring / RTL-aware layout is planned for **v1.1** (PM Q13, RFC §5.4); the layout engine uses `segmentOrder()` so L/R placement is not hard-coded irreversibly.

## ARIA / crosshair

See [docs/aria-footprint.md](./docs/aria-footprint.md) and `buildFootprintCrosshairPayload`.

## Examples (Vite)

From this package directory (`honeycomb/packages/core/`) after `npm ci`:

```bash
npm run examples:dev
```

Open the URL printed by Vite (default port **5180**). See [examples/README.md](./examples/README.md) for the route index (includes **static dataset** / display config on port **5185**: **`npm run examples:dev:static`**).

## Brush stats (v1.2)

Range selection is **host-owned** (time scale / plugins). After you derive an inclusive **`UTCTimestamp`** interval, use **`filterBarsByFootprintBrush`** and **`runFootprintBrushReducers`** on your `EnrichedCandle` slice. Normative semantics, reducer table, and wiring diagram: [docs/brush-reducers-v1.2.md](./docs/brush-reducers-v1.2.md). Runnable demo: **`npm run examples:dev:brush`** (see [examples/README.md](./examples/README.md)).

**Correction flash (v1.2):** option **`correctionFlash: 'subtle' | 'off'`** (default **`off`**) — see [docs/correction-flash-v1.2.md](./docs/correction-flash-v1.2.md) and [docs/qa-footprint-v1.2.md](./docs/qa-footprint-v1.2.md).

## Replay mode (v2)

**Live or replay per host contract** — chart data passed to **`setData`** in replay must satisfy **no future bars** for the playhead. Normative doc: [docs/replay-mode-v2.md](./docs/replay-mode-v2.md). Pure helpers: **`filterEnrichedCandlesAtOrBeforePlayhead`**, **`deriveFootprintReplayDomain`**, **`clampFootprintReplayPlayhead`**, **`assertFootprintReplayHasNoFutureBars`** — bar **`time`** and playhead must be **`Number.isFinite`** (see doc **§Finite times**). Runnable demo: **`npm run examples:dev:replay`**; CI includes **`npm run test:e2e:replay`** (Puppeteer on the built example).

## Path A vs Path B (data)

- **Path A:** Host supplies fully enriched candles (`setData` / `update` on `HoneycombSeries` only).
- **Path B:** High-frequency ticks flow through **`FootprintDataAdapter`** (token-bucket) and **`FootprintSeriesBinding`** wires chart + series + adapter lifecycle.

```ts
import { createChart } from 'lightweight-charts';
import {
	HoneycombSeries,
	defaultHoneycombSeriesOptions,
	FootprintSeriesBinding,
	FootprintDataAdapter,
} from '@honeycomb/charts';

const chart = createChart(container);
const series = chart.addCustomSeries(new HoneycombSeries(), defaultHoneycombSeriesOptions);
const binding = new FootprintSeriesBinding(new FootprintDataAdapter());
binding.adapter.pushTick({ time: 1700000000, price: 100, size: 1 });
binding.startRafFlush((_bucket, ticks) => {
	/* merge ticks → series.update / setData */
	void ticks;
});
// …when tearing down:
binding.destroy();
```

## Bar width & conflation (RFC §5.5)

`FootprintRenderer` uses **`effectiveBarSpacing = barSpacing × max(1, conflationFactor)`** from `PaneRendererCustomData`, then the same **`optimalCandlestickWidth`** policy as core candles (duplicated helper per RFC D11). Unit mirror: `tests/conflation-effective-bar-spacing.spec.ts`.
