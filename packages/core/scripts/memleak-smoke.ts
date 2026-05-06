/**
 * Browser heap smoke: mount/destroy many charts with HoneycombSeries (T-104).
 *
 * Heuristic (best-effort, not a substitute for memlab): median `usedJSHeapSize`
 * growth after N cycles should stay below `maxGrowthMb` (default **80** MB) on Chrome headless.
 *
 * Run: `npm run test:memleak` from `packages/core` after `npm run build` at repo root + package.
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

import { assertHarnessAssetsExist, createHarnessAssetListener } from '../tests/e2e/harness-asset-handler.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(pkgRoot, '..', '..');
const fixturesDir = path.join(pkgRoot, 'tests', 'e2e', 'fixtures');

const MEM_PAGE = `<!DOCTYPE html><html><head>
<script type="importmap">{"imports":{"fancy-canvas":"/vendor/fancy-canvas/index.mjs","lightweight-charts":"/lwc.mjs"}}</script>
</head><body><div id="c"></div>
<script type="module">
import { createChart } from '/lwc.mjs';
import { HoneycombSeries, defaultHoneycombSeriesOptions } from '/hc/index.js';
const el = document.getElementById('c');
window.run = async (cycles) => {
  const mem = [];
  if (performance.memory) mem.push(performance.memory.usedJSHeapSize);
  for (let i = 0; i < cycles; i++) {
    const chart = createChart(el, { width: 400, height: 280, layout: { background: { color: '#000' } } });
    const s = chart.addCustomSeries(new HoneycombSeries(), { ...defaultHoneycombSeriesOptions, priceLineVisible: false });
    s.setData([{ time: 1700000000 + i, open: 1, high: 2, low: 0, close: 1.5, levels: [{ price: 1, values: { bid: 1, ask: 1, delta: 0 } }] }]);
    chart.remove();
    if (performance.memory && i % 20 === 19) mem.push(performance.memory.usedJSHeapSize);
  }
  if (performance.memory) mem.push(performance.memory.usedJSHeapSize);
  return mem;
};
window.hcMemSmokeReady = true;
</script></body></html>`;

function startServer(port: number): Promise<() => void> {
	assertHarnessAssetsExist({ repoRoot, pkgRoot, fixturesDir });
	const baseListener = createHarnessAssetListener({ repoRoot, pkgRoot, fixturesDir });
	const server = http.createServer((req, res) => {
		const url = req.url?.split('?')[0] ?? '/';
		const contentType = 'Content-Type';
		if (url === '/' || url === '/mem.html') {
			res.writeHead(200, { [contentType]: 'text/html; charset=utf-8' });
			res.end(MEM_PAGE);
			return;
		}
		baseListener(req, res);
	});
	return new Promise((resolve, reject) => {
		server.listen(port, '127.0.0.1', () => resolve(() => server.close()));
		server.on('error', reject);
	});
}

async function main(): Promise<void> {
	const port = 42890;
	const stop = await startServer(port);
	const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
	try {
		const page = await browser.newPage();
		await page.goto(`http://127.0.0.1:${port}/mem.html`, { waitUntil: 'load', timeout: 60_000 });
		await page.waitForFunction(() => (globalThis as unknown as { hcMemSmokeReady?: boolean }).hcMemSmokeReady === true, {
			timeout: 30_000,
		});
		const mem = (await page.evaluate(async () => {
			const w = globalThis as unknown as { run?: (n: number) => Promise<number[]> };
			return await w.run?.(200) ?? [];
		})) as number[];
		if (mem.length < 2) {
			throw new Error('performance.memory unavailable in this Chrome build; run with --enable-precise-memory-info or skip.');
		}
		const growth = (mem[mem.length - 1]! - mem[0]!) / (1024 * 1024);
		const maxGrowthMb = Number(process.env['HC_MEMLEAK_MAX_MB'] ?? 80);
		const out = { growthMb: growth, maxGrowthMb, samples: mem };
		console.log(JSON.stringify(out, null, 2));
		if (growth > maxGrowthMb) {
			throw new Error(`Heap growth ${growth.toFixed(1)} MB exceeds ${maxGrowthMb} MB heuristic`);
		}
	} finally {
		await browser.close();
		stop();
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
