# Static dataset + display config

- **`static-enriched-candles.ts`** — fixed pool of **30** `EnrichedCandle` rows (60s spacing).
- **`chart-display-config.ts`** — **`defaultStaticDatasetChartDisplayConfig`**: by default shows **20** bars (`sliceMode: 'last'`).
- **`main.ts`** — slices the pool, merges **`seriesOptionsPatch`**, then `setData`.

## UX (first-run)

The page includes a **short legend** (what bid / ask / delta / candle layers are) and slightly **larger default `minFontPx` / `minCellHeightPx`** than the library baseline so the demo reads better on laptops. Tune **`seriesOptionsPatch`** in `chart-display-config.ts` or reduce **`visibleBarCount`** if you want bigger numbers at the same window width.

## Run

From `packages/honeycomb-charts` after root `npm run build` and `npm install` here:

```bash
npm run examples:dev:static
```

Open **http://localhost:5185** (Vite).

### Query overrides (optional)

| Query | Example | Effect |
|-------|---------|--------|
| `bars` | `?bars=15` | Visible count (clamped to pool size, min 1). |
| `slice` | `?slice=first` | `first` or `last` segment of the pool. |

Example: `?bars=20&slice=last` matches the default file config.

## Versions

Same as other package examples: **`honeycomb-charts`** from `src/` via Vite alias; **`lightweight-charts`** from `file:../..` after root build.
