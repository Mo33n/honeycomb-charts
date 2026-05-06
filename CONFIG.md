# `config.json` — what every knob does (catalog guide)

Hey. **`config.json`** is your **layout catalog**: one file the compiler eats and the runtime reads. This doc is the friendly map; **`config.schema.json`** is the strict contract (open it in an editor with JSON Schema support and you get autocomplete + validation).

**Working with the chart in code?** See **[`demo/DEVELOPER.md`](demo/DEVELOPER.md)** for `addHoneycombLayoutSeries`, bindings, and autoswitch.

---

## Quick sanity check

From `honeycomb/`:

```bash
node ./scripts/validate-catalog-schema.mjs
npm run compile:layouts
```

If validation fails, fix JSON before chasing runtime ghosts.

---

## Top-level keys (the file at a glance)

| Key | Required? | What it’s for |
|-----|-------------|----------------|
| **`schemaVersion`** | yes | Semver string for this catalog format. |
| **`layouts`** | yes | Array of layout definitions (at least one). |
| **`$schema`** | no | Points at `config.schema.json` so your IDE helps you. |
| **`defaultLayoutId`** | no | Fallback layout id when the app doesn’t pass one (e.g. main demo). |
| **`dataContract`** | no | Documents + drives **data mapping**: level keys, bar keys, **aliases** (rename incoming fields → canonical metric ids). |
| **`templates`** | no | Reusable track fragments; layouts reference them with **`templateRef`**. |
| **`themes`** | no | Named style token bundles; layouts pick one with **`themeRef`**. |
| **`segmentProfiles`** | no | Named **viewport → layout** rule sets for autoswitch (see below). |
| **`renderingModel`** | no | Human-facing docs about how binding + presentation work (compiler doesn’t need it). |
| **`productGoals`** | no | Optional PM blurbs — **ignored by compile**. |

---

## `dataContract` — how your data lines up with columns

Roughly: “these are the keys we expect on each **level** row and on the **bar**.”

```json
"dataContract": {
  "levelValueKeys": ["bid", "ask", "vol", "delta"],
  "barAggregateKeys": ["open", "high", "low", "close", "volume", "volume_delta"],
  "aliases": {
    "buy_qty": "bid",
    "sell_qty": "ask"
  }
}
```

- **`levelValueKeys`** — canonical metric ids for **`levels[].values`** (per price row).
- **`barAggregateKeys`** — OHLC-style / bar-level fields.
- **`aliases`** — “if the API sends `buy_qty`, treat it as `bid`.” Your app’s **`applyDataMapping`** (or equivalent) uses this so **`config.json`** and **`SampleData.json`** don’t have to use identical names.

---

## `templates` — DRY for tracks

Named objects you **`templateRef`** from a track. Keeps repeated histogram/number configs out of every layout.

```json
"templates": {
  "num_bid_cell": {
    "role": "number",
    "metricId": "bid",
    "cellBackground": "rgba(36, 38, 44, 0.92)"
  }
}
```

In a layout: `{ "templateRef": "num_bid_cell" }` merges this in at compile time.

---

## `themes` — shared colors/fonts

Arbitrary key/value bundles. Layouts say **`"themeRef": "desk_dark"`** and the compiler/runtime passes the matching object into the generic footprint merge path.

---

## `layouts[]` — one row per layout id

Each entry is **required** to have:

- **`id`** — stable string id (`^[a-z][a-z0-9_]*$` in schema). This is what you pass to **`addHoneycombLayoutSeries(chart, id, catalog, …)`**.
- **`engine`** — today the schema’s **`layout`** rule focuses on **`genericFootprint`** (classic footprint engine may exist in older catalogs; follow your local schema).
- **`segment`** — the big blob: tracks, weights, chrome, etc. (shape depends on **`engine`**).

Common **optional** fields:

- **`label`**, **`description`** — for humans / tooling.
- **`themeRef`** — key into **`themes`**.
- **`segmentProfileRef`** — key into **`segmentProfiles`**. If set, this layout is a **profile host** (or any layout that should compile with a **profileSelector**). Used for autoswitch.

### `segment` for `genericFootprint` (`segmentGenericFootprint`)

| Field | Notes |
|--------|--------|
| **`tracks`** | Ordered array of **columns** left → right (each item is a **`genericTrack`** or expands from **`templateRef`**). |
| **`trackWeights`** | Length = number of **non-candle** tracks (compiler enforces). Relative horizontal weight per column. **Σweights** is also used by viewport autoswitch heuristics (heavier layout → needs more “room”). |
| **`chrome`** | Layout chrome: e.g. **`candleStripFraction`**, **`showPriceGrid`**, **`histogramShowValues`**, LOD hints (`lodHideNumberMinSlotAreaPx`, …). |
| **`summaries`** | **`header`** / **`footer`** lines of **`barSummaryLine`** (`metricId`, `colorBySign`). |
| **`poc`** | Point-of-control hint, e.g. `{ "metricId": "vol" }`. |
| **`typography`**, **`spacing`** | Font and spacing overrides forwarded into the plan. |

### Track `role` (`genericTrack`)

Schema allows: **`histogram`**, **`number`**, **`ratio`**, **`heatmapCell`**, **`bar`**, **`candle`**.

- **`candle`** — mini OHLC strip; usually one per segment.
- **`histogram`** — e.g. **`metricId`**, **`grow`**: `"left"` \| `"right"` \| `"center"`, colors, **`histogramMaxFillFrac`**, **`histogramLengthGamma`**, etc.
- **`number`** — text cell; **`metricId`**, **`cellBackground`**, **`colorBySign`**, …
- **`ratio`**, **`heatmapCell`**, **`bar`** — see schema / ADRs in `docs/` for extras (`colorMode`, `heatmapColor`, `barAlignMode`, …).

Tracks can use **`templateRef`** instead of inlining every field.

---

## `segmentProfiles` — autoswitch / viewport tiers

Named profiles. Each profile has:

- **`rules`** — non-empty array of **`{ minWidthPx, layoutId }`**.
- **`hysteresisPx`** (optional) — band around breakpoints so the active layout doesn’t flicker (see **`segment-profile.mjs`**).

**How selection works:** the runtime computes a **single CSS “selector width”** (from your chart container + zoom + optional per-bar floor). It then picks the **richest** rule whose **`minWidthPx`** is still satisfied (see **`pickLayoutIdForWidth`**). So **higher `minWidthPx` → more detailed layout**, **0** is usually your “simplest” tier.

**Important:** every **`layoutId`** in **`rules`** must exist in **`layouts[]`**. The **host** layout that references this profile sets **`segmentProfileRef`** to the profile’s key.

Example (matches this repo’s autoswitch demo):

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
}
```

---

## `defaultLayoutId`

Used when the app doesn’t override layout id (e.g. **`main.ts`** without **`?layout=`**). It does **not** have to be your profile host — it’s just the default **single-layout** entry point unless you build an autoswitch page that passes **`demo_autoswitch_host`** (or similar).

---

## `renderingModel` & `productGoals`

Documentation for humans. Safe to skip in minimal catalogs; **`compile-layout.mjs`** doesn’t depend on them.

---

## After you edit `config.json`

1. **`node ./scripts/validate-catalog-schema.mjs`**
2. **`npm run compile:layouts`**
3. Rebuild **`packages/core`** if you changed something the runtime needs from dist (usual dev loop).

---

## Further reading

- **App integration, bindings, autoswitch:** [`demo/DEVELOPER.md`](demo/DEVELOPER.md)
- **Demo setup & sample data:** [`demo/README.md`](demo/README.md)
- **Every field, formally:** `config.schema.json`

If something’s missing here but exists in the schema, the schema wins — ping the team to extend this doc.
