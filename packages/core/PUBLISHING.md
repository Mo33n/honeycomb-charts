# Publishing `@honeycomb/charts` (npm or GitHub)

Installable package lives in **`packages/core`**. It ships:

| Subpath | Contents |
|---------|----------|
| `@honeycomb/charts` | TypeScript runtime (`dist/`) — series, viewport, patches |
| `@honeycomb/charts/chart-binding` | LWC layout binding (`vendor/lib/chart-binding.mjs`) |
| `@honeycomb/charts/mutation-scheduler` | Per-frame mutation drain |
| `@honeycomb/charts/data-mapping` | `dataContract` alias helpers |
| `@honeycomb/charts/catalog` | Default layout catalog (`config.json`) |

## Before tagging a release

From **`honeycomb/`** repo root:

```bash
npm run validate:catalog
npm run compile:layouts
npm run publish:prepare
```

Or from **`packages/core`**:

```bash
npm run verify:pack
```

## GitHub dependency (recommended for this fork)

Push **`packages/core`** as the root of **`Mo33n/honeycomb-charts`** (or tag the monorepo and install with a path — see below).

In consumer `package.json`:

```json
{
  "dependencies": {
    "@honeycomb/charts": "github:Mo33n/honeycomb-charts#v0.1.0",
    "lightweight-charts": "^5.2.0"
  }
}
```

Branches / commits:

```json
"@honeycomb/charts": "github:Mo33n/honeycomb-charts#main"
"@honeycomb/charts": "github:Mo33n/honeycomb-charts#abc1234"
```

**pnpm** can install from a subdirectory of a monorepo without republishing:

```json
"@honeycomb/charts": "github:Mo33n/honeycomb#v0.1.0&path:honeycomb/packages/core"
```

On `pnpm install`, npm runs **`prepare`**: `tsc` build + `vendor:sync` (copies `lib/` + `config.json`). Requires **Node ≥ 22.3**.

## npm registry (optional)

```bash
cd packages/core
npm login
npm publish --access public
```

## Consumer imports (Trade Terminal / Nuxt)

Remove Vite aliases to sibling `../honeycomb/` and import:

```ts
import * as hc from '@honeycomb/charts';
import { createHoneycombChartBinding } from '@honeycomb/charts/chart-binding';
import { createMutationApplyScheduler } from '@honeycomb/charts/mutation-scheduler';
import catalog from '@honeycomb/charts/catalog';
```

Legacy demo alias `@honeycomb/lib/chart-binding.mjs` maps to `@honeycomb/charts/lib/chart-binding.mjs`.

## Release checklist

1. Bump `version` in `packages/core/package.json`
2. `npm run publish:prepare` (from `honeycomb/`)
3. `npm run verify:pack` (from `packages/core`)
4. Commit, tag `vX.Y.Z`, push tag
5. Consumers pin `#vX.Y.Z` on GitHub or semver on npm
