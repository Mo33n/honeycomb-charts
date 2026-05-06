# Building `honeycomb-charts` locally

Verified sequence on a clean checkout:

1. **Install root deps** (repository root):

   ```bash
   npm install
   ```

2. **Build core `lightweight-charts` including production bundle** (required so `dist/lightweight-charts.production.mjs` exists for Node resolution of the peer package):

   ```bash
   npm run build:prod
   ```

3. **Install honeycomb package deps**:

   ```bash
   cd packages/honeycomb-charts
   npm install
   ```

4. **Build & test honeycomb**:

   ```bash
   npm run build
   npm test
   npm run lint
   npm run perf
   ```

   Optional browser / release smoke (requires root `npm run build` for `lightweight-charts.development.mjs`):

   ```bash
   npm run test:e2e
   npm run test:graphics
   # Optional: `HC_GRAPHICS_SCENARIO=barColumn` to run one PNG scenario; see tests/graphics/README.md
   npm run test:memleak
   npm run pack:dry
   npm run publish:dry
   ```

   One-shot after root build: **`npm run verify:all`** (includes layout-only perf with `HC_SKIP_BROWSER_PERF=1`; memleak not included — run `npm run test:memleak` separately if needed).

5. **Optional — Vite examples**:

   ```bash
   npm run examples:dev
   npm run examples:dev:pathb
   npm run examples:dev:brush
   npm run examples:dev:session
   npm run examples:dev:replay
   npm run examples:dev:static
   npm run examples:dev:canvas
   npm run examples:dev:generic-footprint
   ```

   See [examples/README.md](./examples/README.md).

## Release (fork)

Template checklist (RFC §10.10.5 / **T-112**): [docs/release-checklist.md](./docs/release-checklist.md) (includes **§v2** / **§v1.2** deltas + links to [docs/replay-mode-v2.md](./docs/replay-mode-v2.md), [docs/ghost-overlay-v2.md](./docs/ghost-overlay-v2.md), [docs/qa-footprint-v1.2.md](./docs/qa-footprint-v1.2.md)). CI runs `.github/workflows/honeycomb-charts.yml` when this package changes; successful runs attach **`honeycomb-perf-ci`** (layout perf JSON). Locally, `HC_PERF_JSON_OUT=./perf.json npm run perf` mirrors that file output (see `tests/perf/README.md`).

6. **Optional — verify tarball contents**:

   ```bash
   npm pack --dry-run
   ```

## `plugin-examples`

From `plugin-examples/`:

```bash
npm install
npm run build
npm run dev
```

`plugin-examples` depends on `lightweight-charts` via `file:..` and `honeycomb-charts` via `file:../packages/honeycomb-charts`. Build core (step 2) and honeycomb (step 4) before compiling examples.
