# `@mo33n/honeycomb-charts`

Footprint (order-flow style) **custom series** for [Lightweight Charts](https://www.tradingview.com/lightweight-charts/).

Peer dependency: `lightweight-charts` ≥ 5.

## Install

```bash
npm install @mo33n/honeycomb-charts lightweight-charts
```

GitHub Packages (scope `@mo33n`):

```
@mo33n:registry=https://npm.pkg.github.com
```

## Subpath exports

| Import | Purpose |
|--------|---------|
| `@mo33n/honeycomb-charts` | Core runtime — series, viewport, patches |
| `@mo33n/honeycomb-charts/chart-binding` | Layout binding on `IChartApi` |
| `@mo33n/honeycomb-charts/mutation-scheduler` | Per-frame mutation drain |
| `@mo33n/honeycomb-charts/catalog` | Default layout catalog |
| `@mo33n/honeycomb-charts/data-mapping` | `dataContract` field aliases |

## Quick start

```ts
import { createChart } from 'lightweight-charts';
import { HoneycombSeries, defaultHoneycombSeriesOptions } from '@mo33n/honeycomb-charts';

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

## Chart desk binding

```ts
import { createChart } from 'lightweight-charts';
import * as hc from '@mo33n/honeycomb-charts';
import { createHoneycombChartBinding } from '@mo33n/honeycomb-charts/chart-binding';
import catalog from '@mo33n/honeycomb-charts/catalog';

const chart = createChart(container);
const binding = createHoneycombChartBinding(chart, catalog, hc, 'desk_dark_delta_vol_hist');
binding.series.setData(enrichedBars);
```

## Tick adapter (streaming)

```ts
import { createChart } from 'lightweight-charts';
import {
  HoneycombSeries,
  defaultHoneycombSeriesOptions,
  FootprintSeriesBinding,
  FootprintDataAdapter,
} from '@mo33n/honeycomb-charts';

const chart = createChart(container);
const series = chart.addCustomSeries(new HoneycombSeries(), defaultHoneycombSeriesOptions);
const binding = new FootprintSeriesBinding(new FootprintDataAdapter());
binding.adapter.pushTick({ time: 1700000000, price: 100, size: 1 });
binding.startRafFlush((_bucket, ticks) => {
  /* merge ticks → series.update / setData */
});
binding.destroy();
```

## License

Apache-2.0. Retain `NOTICE` / license attribution; do not imply TradingView endorsement.
