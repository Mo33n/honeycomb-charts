# Custom canvas demos (no Lightweight Charts)

Standalone **HTML + Canvas** examples for visuals that are **not** time-series footprint charts. The shared **`CanvasHost`** handles DPR, resize, and clearing so each demo only implements **`CanvasScene.draw`**.

## Run

From `packages/honeycomb-charts`:

```bash
npm run examples:dev:canvas
```

Open the URL Vite prints (default **http://localhost:5187**). Use **`?demo=butterfly`** to pick a registered demo (navigation links are generated from the registry).

## Add a new canvas demo

1. Create a folder under **`demos/<your-id>/`** (e.g. `demos/sparkline/`).
2. Export a class (or factory) that satisfies **`CanvasScene`** from **`lib/canvas-host.ts`**:
   - **`id`**: URL slug, stable string.
   - **`title`**: short label for the nav.
   - **`draw(ctx, layout)`**: draw in **CSS pixel** coordinates (the host applies `devicePixelRatio` for you).
3. Register the scene in **`demos/registry.ts`** (append to **`CANVAS_DEMOS`**).
4. Reload the dev server; the new demo appears in the header nav.

Optional hooks: **`onResize`**, **`destroy`** (timers, external resources).

## Layout of this folder

| Path | Role |
|------|------|
| **`lib/canvas-host.ts`** | **`CanvasHost`**, **`CanvasScene`**, **`CanvasLayout`** |
| **`demos/registry.ts`** | Single list of demos for `main.ts` + future routers |
| **`demos/butterfly/`** | Diverging “butterfly” bars + static **`sample-data.ts`** |
| **`demos/number-bar/`** | Footprint-style **number block**: **multiple metrics** per row (`cells[]` + `columnLabels`), shared heatmap / POC frame across the block, then a **separate candle lane** (tinted strip + mini OHLC) + price **grid** (`?demo=number_bar`) |
| **`demos/footprint-generic/`** | **Config-driven** footprint: **`FootprintGenericViewModel`** (`slots`: `histogram` \| `number` \| **`ratio`**, **`histogramShowValues`**, **`pocMetricId`**, theme histogram label fonts) → **`buildFootprintLayout`** → **`renderFootprintGeneric`** (`?demo=footprint_generic`). |
| **`main.ts`** | Mount host, `?demo=`, populate nav |

This is intentionally **outside** `src/` so it stays example-only and does not ship in the npm package.
