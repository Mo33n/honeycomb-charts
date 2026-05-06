# Honeycomb catalog demo (CT-D03)

Minimal Vite app: loads **`../config.json`**, **`../SampleData.json`**, applies **`dataContract`** aliases, and attaches the default layout with **`addHoneycombLayoutSeries`** + **`lightweight-charts`**.

## Prerequisites (once per machine / after dependency changes)

From the **charts** repo root (the directory that contains **`honeycomb/`** and **`lightweight-charts/`**):

1. **Compile layout artifacts** (segment plans + partials):

   ```bash
   cd honeycomb && npm run compile:layouts
   ```

2. **Build @honeycomb/charts** (the demo resolves `dist/index.js`):

   ```bash
   cd ../packages/core && npm install && npm run build
   ```

3. **Lightweight Charts** must already have **`lightweight-charts/dist/lightweight-charts.development.mjs`** (run `npm install` / build in **`lightweight-charts/`** if that file is missing).

## Generate SampleData.json (no starter file needed)

The sample-data generator now bootstraps directly from:

- `--startPrice`
- `--avgVolumePerMin`
- `--startTime` (ISO-8601)

It always generates **1-minute candles**.

```bash
cd honeycomb && node ./scripts/generate-sample-data.mjs \
  --count=300 \
  --seed=42 \
  --startPrice=2.11 \
  --avgVolumePerMin=9000 \
  --startTime=2026-05-01T09:30:00Z \
  --out=./SampleData.json
```

## Run the demo

```bash
cd honeycomb/demo && npm install && npm run dev
```

Open the URL Vite prints (default **http://localhost:5190**).

- Autoswitch demo page: **`http://localhost:5190/autoswitch.html`**
  - Uses `createHoneycombChartBinding` + `segmentProfiles` to auto-swap by viewport width + zoom: **zoom out** (many bars) → `desk_candle_only`; zoom in → `desk_candle_vol_profile` → **more zoom in** → `pro_max_custom`.
  - **Zoom signal:** `raw = clientWidth × (baselineVisibleSpan / visibleLogicalSpan)` (clamped). **Uncapped** = `raw × (median Σweights over profile layouts / Σweights current layout)`. **Selector width** = `min(uncapped, perBarPx × scale)` — pure logic in **`demo/src/segment-profile-selector-width.ts`**; wiring in **`demo/src/main-autoswitch.ts`**.
  - Re-applies `setData` after each swap (new series handle per layout change).

## Notes

- **`?layout=<id>`** is supported. If `<id>` exists in `config.json.layouts`, it overrides **`defaultLayoutId`** for that page load.
  - Default now points to `pro_max_custom` (max customization example).
  - Example: `http://localhost:5190/?layout=desk_dark_vol_ratio_delta`
  - Unknown ids safely fall back to `config.defaultLayoutId`.
- Data path: **`applyDataMapping`** then **`levels[].values`** for **`GenericFootprintSeries`**. Footprint engine layouts would need a different candle shape (`FootprintDataAdapter` / binding) before **`setData`**; this demo targets the repo’s default **genericFootprint** layouts.
