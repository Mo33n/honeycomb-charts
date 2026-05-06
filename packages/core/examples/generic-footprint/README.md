# GenericFootprintSeries (Lightweight Charts)

Demonstrates **`GenericFootprintSeries`**: a custom LWC series with **histogram | ratio (Δ/vol) | histogram** slots over **`EnrichedCandle`** data.

From `honeycomb/packages/core/`:

```bash
npm run build
npm run examples:dev:generic-footprint
```

Open the printed URL (default **http://localhost:5188**). The example loads **24** bars from `sample-candles.ts`.

Options are merged from **`defaultGenericFootprintSeriesOptions`**; override **`slots`**, **`slotWeights`**, **`theme`**, **`pocMetricId`**, etc. via `mergeGenericFootprintSeriesOptions`.
