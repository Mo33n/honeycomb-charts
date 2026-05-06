/**
 * Capture or compare footprint graphics baselines (T-101 / T-032 / T-033).
 *
 * - **Update all baselines:** `UPDATE_GRAPHICS=1 npm run test:graphics`
 * - **Compare:** `npm run test:graphics`
 * - **Single scenario (write/compare one file):** `HC_GRAPHICS_SCENARIO=barColumn UPDATE_GRAPHICS=1 npm run test:graphics`
 *
 * Requires repo root `npm run build` and package `npm run build`.
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import puppeteer, { type Page } from 'puppeteer';

import { assertHarnessAssetsExist, createHarnessAssetListener } from '../e2e/harness-asset-handler.js';

const graphicsDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(graphicsDir, '..', '..');
const repoRoot = path.resolve(pkgRoot, '..', '..');
const e2eFixturesDir = path.join(pkgRoot, 'tests', 'e2e', 'fixtures');
const graphicsFixturesDir = path.join(graphicsDir, 'fixtures');
const baselinesDir = path.join(graphicsDir, 'baselines');

type ScenarioRow = { readonly scenario: string; readonly file: string; readonly page?: string };

const SCENARIOS: readonly ScenarioRow[] = [
	{ scenario: 'default', file: 'footprint-default.png', page: 'graphics.html' },
	{ scenario: 'barColumn', file: 'footprint-bar-columns.png', page: 'graphics.html' },
	{ scenario: 'candleOff', file: 'footprint-candle-off.png', page: 'graphics.html' },
	{ scenario: 'zOutline', file: 'footprint-z-outline-front.png', page: 'graphics.html' },
	{ scenario: 'ruleColors', file: 'footprint-rule-colors.png', page: 'graphics.html' },
	{ scenario: 'lodFloor', file: 'footprint-lod-floor.png', page: 'graphics.html' },
	{ scenario: 'footprintCellBand', file: 'footprint-cell-band.png', page: 'graphics.html' },
	{ scenario: 'footprintOverlayStack', file: 'footprint-overlay-stack.png', page: 'graphics.html' },
	{ scenario: 'footprintOverlayOpacityEdge', file: 'footprint-overlay-opacity-edge.png', page: 'graphics.html' },
	{ scenario: 'genericHeatSequential', file: 'generic-heatmap-sequential.png', page: 'generic-graphics.html' },
	{ scenario: 'genericHeatDiverging', file: 'generic-heatmap-diverging.png', page: 'generic-graphics.html' },
	{ scenario: 'genericHeatValueSecondary', file: 'generic-heatmap-value-secondary.png', page: 'generic-graphics.html' },
	{ scenario: 'genericCellBand', file: 'generic-cell-band.png', page: 'generic-graphics.html' },
	{ scenario: 'genericSummaryLodHidden', file: 'generic-summary-lod-hidden.png', page: 'generic-graphics.html' },
	{ scenario: 'genericRatioLodHidden', file: 'generic-ratio-lod-hidden.png', page: 'generic-graphics.html' },
	{ scenario: 'genericProgressiveLodHidden', file: 'generic-progressive-lod-hidden.png', page: 'generic-graphics.html' },
	{ scenario: 'genericOverlayStack', file: 'generic-overlay-stack.png', page: 'generic-graphics.html' },
	{ scenario: 'genericOverlayOpacityEdge', file: 'generic-overlay-opacity-edge.png', page: 'generic-graphics.html' },
	{ scenario: 'genericOverlayDenseRows', file: 'generic-overlay-dense-rows.png', page: 'generic-graphics.html' },
];

function startServer(port: number): Promise<() => void> {
	assertHarnessAssetsExist({ repoRoot, pkgRoot, fixturesDir: e2eFixturesDir, graphicsFixturesDir });
	const listener = createHarnessAssetListener({
		repoRoot,
		pkgRoot,
		fixturesDir: e2eFixturesDir,
		graphicsFixturesDir,
	});
	const server = http.createServer(listener);
	return new Promise((resolve, reject) => {
		server.listen(port, '127.0.0.1', () => resolve(() => server.close()));
		server.on('error', reject);
	});
}

async function runOneScenario(
	page: Page,
	baseUrl: string,
	scenario: string,
	baselinePath: string,
	update: boolean,
	maxDiff: number,
	pageHtml: string
): Promise<void> {
	const url = `${baseUrl}${pageHtml}?scenario=${encodeURIComponent(scenario)}`;
	await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
	await page.waitForFunction(() => (globalThis as Record<string, unknown>)['__TEST_READY'] === true, {
		timeout: 30_000,
	});
	const canvas = await page.$('canvas');
	if (!canvas) {
		throw new Error(`no canvas for scenario ${scenario}`);
	}
	const buf = (await canvas.screenshot({ type: 'png' })) as Buffer;

	if (update) {
		fs.writeFileSync(baselinePath, buf);
		console.log(`Wrote baseline: ${baselinePath}`);
		return;
	}

	if (!fs.existsSync(baselinePath)) {
		console.log(`SKIP: no baseline at ${baselinePath}. Set UPDATE_GRAPHICS=1 to create.`);
		return;
	}

	const imgA = PNG.sync.read(buf);
	const imgB = PNG.sync.read(fs.readFileSync(baselinePath));
	if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
		throw new Error(
			`${scenario}: size mismatch: got ${imgA.width}x${imgA.height}, baseline ${imgB.width}x${imgB.height}`
		);
	}
	const diff = new PNG({ width: imgA.width, height: imgA.height });
	const n = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, { threshold: 0.22 });
	if (n > maxDiff) {
		const diffPath = baselinePath.replace(/\.png$/i, '.diff.png');
		fs.writeFileSync(diffPath, PNG.sync.write(diff));
		throw new Error(`${scenario}: ${n} pixels differ (max ${maxDiff}). Wrote ${diffPath}`);
	}
	console.log(`${scenario}: ok (${n} px diff, max ${maxDiff})`);
}

async function main(): Promise<void> {
	const lwcPath = path.join(repoRoot, 'dist', 'lightweight-charts.development.mjs');
	const hcIndex = path.join(pkgRoot, 'dist', 'index.js');
	if (!fs.existsSync(lwcPath) || !fs.existsSync(hcIndex)) {
		throw new Error('Missing dist bundles. Run root `npm run build` and `packages/core` `npm run build`.');
	}
	fs.mkdirSync(baselinesDir, { recursive: true });

	const filter = process.env['HC_GRAPHICS_SCENARIO'];
	const maxDiff = Number(process.env['HC_GRAPHICS_MAX_DIFF'] ?? 8000);
	const update = process.env['UPDATE_GRAPHICS'] === '1';

	const port = 43100;
	const stop = await startServer(port);
	const baseUrl = `http://127.0.0.1:${port}/`;
	const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
	try {
		const page = await browser.newPage();
		for (const row of SCENARIOS) {
			if (filter !== undefined && filter !== '' && row.scenario !== filter) {
				continue;
			}
			const baselinePath = path.join(baselinesDir, row.file);
			await runOneScenario(page, baseUrl, row.scenario, baselinePath, update, maxDiff, row.page ?? 'graphics.html');
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
