# Developer guide: Honeycomb + this demo (the stuff README skips)

Hi. If you’re wiring TradingView’s **lightweight-charts** to our **generic footprint** runtime, this file is the quick mental model + copy-paste examples. It’s written for devs who’d rather ship than read the whole compiler. When something’s wrong, 90% of the time it’s “catalog + compile + data shape” — we’ll make that obvious.

**Repo pointers**

| You want | Open this in the repo |
|----------|------------------------|
| **What each `config.json` field means** | **`../CONFIG.md`** (schema cheat sheet + links here) |
| One static layout, URL `?layout=` | `src/main.ts` |
| Autoswitch / zoom-driven layouts | `src/main-autoswitch.ts` |
| Price format & series overrides | `src/user-generic-series-options.ts` |
| The catalog file itself | `../config.json` |
| Strict machine-readable contract | `../config.schema.json` |

---

## 0. One-time setup (do this or nothing works)

From the monorepo root (folder that contains `honeycomb/`):

```bash
cd honeycomb && npm run compile:layouts
cd packages/core && npm install && npm run build
```

Then the demo’s Vite alias can resolve `@honeycomb/charts` → `packages/core/dist/index.js`.

Don’t skip **`compile:layouts`** — that’s what turns `config.json` into `compiled/*.segmentPlan.json` etc. No compile → confusing runtime errors.

---

## 1. Path A — “I only want one layout”

No switching. No `segmentProfiles`. You pick a **`layouts[].id`** from `config.json` and call **`addHoneycombLayoutSeries`** (or **`createHoneycombChartBinding`** without viewport extras).

**Minimal idea:**

```ts
import * as hc from '@honeycomb/charts';
import { createChart } from 'lightweight-charts';
import { addHoneycombLayoutSeries } from '@honeycomb/lib/chart-binding.mjs';

import catalog from '../config.json' with { type: 'json' };

const chart = createChart(document.getElementById('chart')!, {
  autoSize: true,
});

const series = addHoneycombLayoutSeries(
  chart,
  'desk_dark_delta_vol_hist', // real id from config.json → layouts
  catalog,
  hc,
  { priceFormat: { type: 'price', precision: 2, minMove: 0.01 } } // optional
);

series.setData(myEnrichedBars); // OHLC + levels[].values matching dataContract
chart.timeScale().fitContent();
```

**Concrete ids you can try today** (from this repo’s `config.json`):  
`desk_dark_delta_vol_hist`, `desk_dark_vol_ratio_delta`, `pro_max_custom`, `desk_candle_only`, …

This demo’s **`main.ts`** does the same thing but reads **`defaultLayoutId`** or **`?layout=<id>`** from the URL — handy for clicking around without redeploying.

**Binding variant** (mutations, swapLayout later):

```ts
import { createHoneycombChartBinding } from '@honeycomb/lib/chart-binding.mjs';

const binding = createHoneycombChartBinding(chart, catalog, hc, 'desk_dark_delta_vol_hist', {
  initialViewportWidthCss: el.clientWidth,
  userSeriesOptions: userGenericSeriesOptions,
});

binding.series.setData(myEnrichedBars);
chart.timeScale().fitContent();
```

No **`viewportSegmentProfile`** → no autoswitch wiring. You’re done.

---

## 2. Path B — “Layouts should change when I zoom / resize”

Here you’re using **segment profiles**: named rule lists that map a **computed width (CSS px)** → **which layout id wins**. The runtime (`onViewportWidthCss` + hysteresis) swaps the custom series when the winner changes.

### 2.1 Where “switching between layouts” is declared

**Not in TypeScript.** It’s in **`config.json`**:

1. **`segmentProfiles.<name>.rules`** — array of `{ minWidthPx, layoutId }`. Those **`layoutId`**s are the only candidates.
2. A **host** layout with **`segmentProfileRef`** pointing at that profile. It’s usually a tiny layout (e.g. candle-only) whose only job is to say “use this profile.”
3. Full **layout definitions** for every id mentioned in the rules.

**Real excerpt from this repo** (`demo_autoswitch_profile`):

```json
"segmentProfiles": {
  "demo_autoswitch_profile": {
    "hysteresisPx": 24,
    "rules": [
      { "minWidthPx": 1000, "layoutId": "pro_max_custom" },
      { "minWidthPx": 620, "layoutId": "desk_candle_vol_profile" },
      { "minWidthPx": 0, "layoutId": "desk_candle_only" }
    ]
  }
},
"layouts": [
  {
    "id": "demo_autoswitch_host",
    "segmentProfileRef": "demo_autoswitch_profile",
    "engine": "genericFootprint",
    "segment": {
      "tracks": [{ "role": "candle" }],
      "trackWeights": []
    }
  },
  ...
]
```

Think of **`rules`** as breakpoints on a single number line (selector width). Higher **`minWidthPx`** → richer layout. **`hysteresisPx`** stops flicker when you’re right on the edge.

Your **`initialLayoutId`** passed to **`createHoneycombChartBinding`** must be the **host** (`demo_autoswitch_host` here). The binding resolves the profile once, then **actually renders** whichever **`layoutId`** the profile picks — `pro_max_custom`, `desk_candle_vol_profile`, etc.

### 2.2 Wiring viewport scaling (library does the annoying bits)

You don’t have to wire **`ResizeObserver`** + **`timeScale`** yourself anymore — pass **`viewportSegmentProfile`** when creating the binding:

```ts
const PROFILE_HOST_LAYOUT_ID = 'demo_autoswitch_host';

const binding = createHoneycombChartBinding(chart, catalog, hc, PROFILE_HOST_LAYOUT_ID, {
  initialViewportWidthCss: el.clientWidth,
  userSeriesOptions: userGenericSeriesOptions,
  viewportSegmentProfile: {
    container: el,
    getRelayoutData: () => enriched,
    onViewportSignal: (p) => {
      console.debug(p.layoutId, p.selectorWidthCss);
    },
    // preset: 'dense',           // optional — switches tiers a bit earlier
    // scheduleInitialReconcile: false, // optional — default true here
  },
});

binding.series.setData(enriched);
chart.timeScale().fitContent();
```

What happens under the hood (high level):

- Computes a **zoom-ish width** from container size + visible logical span.
- Scales by **Σ trackWeights** vs a median (so “heavy” layouts need more room).
- Takes **`min`** with a **per-bar** signal so narrow bars don’t keep a busy footprint layout.
- Calls **`binding.onViewportWidthCss(selectorWidth)`** → segment profile picks **`layoutId`** → **`swapLayout`** → your **`getRelayoutData`** runs **`setData`** after a swap.

On teardown (SPA route change, etc.):

```ts
binding.detachViewport?.();
```

That’s the whole **`main-autoswitch.ts`** story in plain English.

### 2.3 Lower-level hook (same math, you wire DOM yourself)

If you’re not using **`chart-binding`**’s integrated option:

```ts
import { attachViewportSegmentProfile } from '@honeycomb/charts';

const handle = attachViewportSegmentProfile({
  chart,
  container: el,
  catalog,
  binding,
  getRelayoutData: () => enriched,
});
handle.reconcileNow();
handle.detach();
```

Same contracts; more control.

---

## 3. Data shape (genericFootprint)

Your bars need OHLC + **`levels`** with **`price`** and **`values`** keyed by what **`dataContract`** / layout expects (e.g. `bid`, `ask`, `vol`, `delta`). This demo runs raw JSON through **`applyDataMapping`** + **`dataMappingFromDataContract`** so column names line up — see **`main.ts`** / **`main-autoswitch.ts`** `toEnrichedCandles`.

If the chart is blank or cells are empty, check **`levelValueKeys`** in **`config.json` → `dataContract`** vs what you actually put in **`values`**.

---

## 4. Cheat sheet

| Goal | Catalog | Code |
|------|---------|------|
| Fixed layout | Any single **`layouts[]`** entry | **`addHoneycombLayoutSeries`** or **`createHoneycombChartBinding`** without **`viewportSegmentProfile`** |
| Switching | **`segmentProfiles`** + **`segmentProfileRef`** on host + target layouts | **`createHoneycombChartBinding(..., hostLayoutId, { viewportSegmentProfile: { container, getRelayoutData } })** |

---

## 5. When you’re stuck

1. **`npm run compile:layouts`** then **`packages/core npm run build`**.
2. **`layoutId` in rules** must exist in **`layouts`** (same catalog).
3. Host layout must use **`segmentProfileRef`** that matches **`segmentProfiles`** key.
4. After a layout swap, **`setData`** must run — binding handles that if **`getRelayoutData`** returns your full array.

Ship it.
