# Publishing `@mo33n/honeycomb-charts`

Installable package lives in **`packages/core`**.

## Three ways to install (not the same thing)

| Method | Shows in GitHub **Packages** sidebar? | Consumer spec |
|--------|--------------------------------------|---------------|
| **GitHub Packages (npm registry)** | **Yes** | `"@mo33n/honeycomb-charts": "0.1.2"` + `.npmrc` |
| **Git tag + git URL** | No (only tags under Releases) | `"github:Mo33n/honeycomb-charts#v0.1.2&path:packages/core"` |
| **npmjs.com** | No (shows on npmjs.com) | `"@honeycomb/charts": "^0.1.0"` (optional, separate) |

Pushing a git tag **does not** populate GitHub Packages. CI must run `npm publish` to `npm.pkg.github.com` (workflow: `.github/workflows/publish-github-package.yml`).

## GitHub Packages (recommended for Trade Terminal)

**Scope must match GitHub owner:** `@mo33n/honeycomb-charts` for repo `Mo33n/honeycomb-charts`.

### Release steps

1. Bump `version` in `packages/core/package.json`
2. From repo root: `npm run publish:prepare`
3. Commit, push `main`
4. Tag and push: `git tag v0.1.2 && git push origin v0.1.2`
5. GitHub Actions publishes to **Packages** (public)

### Consumer `.npmrc` (repo root)

```
@mo33n:registry=https://npm.pkg.github.com
```

For **private** packages, add `//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}` (read:packages).

### Consumer `package.json`

```json
{
  "dependencies": {
    "@mo33n/honeycomb-charts": "0.1.2",
    "lightweight-charts": "^5.2.0"
  }
}
```

### Subpath exports

| Import | Purpose |
|--------|---------|
| `@mo33n/honeycomb-charts` | Core runtime (`dist/`) |
| `@mo33n/honeycomb-charts/chart-binding` | LWC layout binding |
| `@mo33n/honeycomb-charts/mutation-scheduler` | Mutation scheduler |
| `@mo33n/honeycomb-charts/catalog` | Default layout catalog |

## Git dependency (fallback, no Packages UI)

```json
"@mo33n/honeycomb-charts": "github:Mo33n/honeycomb-charts#v0.1.2&path:packages/core"
```

Runs `prepare` on install (build + vendor sync). Slower first install.

## Local mono-repo dev

```json
"@mo33n/honeycomb-charts": "file:../../../honeycomb/packages/core"
```
