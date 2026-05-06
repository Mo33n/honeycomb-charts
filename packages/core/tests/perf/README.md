# Footprint perf harness

## Reference profile (RFC §16.11 Q19)

- **Chrome** latest stable, **1080p** chart width, device pixel ratio **1–2**.
- **Hardware tier:** Apple **M1 Pro / 16 GB** or equivalent (Intel i5-1135G7 / 16 GB / iGPU) for AC-12 style budgets.

## How to run

```bash
cd packages/honeycomb-charts
npm run perf
```

Implementation: `scripts/footprint-bench.ts`.

The script prints **JSON** to stdout:

- **Layout (Node):** **median ms/call** over five outer runs for segment widths + row bands (no canvas).
- **Last bar (headless Chrome):** unless `HC_SKIP_BROWSER_PERF=1`, Puppeteer loads the e2e harness and runs **`runLastBarBurstPerf`**: median wall time for **120×** `series.update` on the last bar (`lastBarBurstUpdate120Ms*`), and the same burst plus **two `requestAnimationFrame` ticks** (`lastBarBurst120Plus2RafMs*`) as a coarse paint-scheduling proxy.

Use as a **pre-release** gate until CI hardware is wired (RFC D10). Skip the browser slice in restricted environments with `HC_SKIP_BROWSER_PERF=1`.

When **`HC_PERF_JSON_OUT`** is set (path relative to cwd or absolute), the same JSON is **also written** to that file (stdout is unchanged). The **`honeycomb-charts`** GitHub workflow sets it to `honeycomb-perf-ci.json` and uploads artifact **`honeycomb-perf-ci`** (layout-only slice when `HC_SKIP_BROWSER_PERF=1` during `verify:all`).
