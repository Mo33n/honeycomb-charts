/**
 * Headless Chrome: median timing for 120× last-bar `series.update` (T-103 browser slice).
 * Invoked from `footprint-bench.ts` unless `HC_SKIP_BROWSER_PERF=1`.
 */
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

import { assertHarnessAssetsExist, createHarnessAssetListener } from '../tests/e2e/harness-asset-handler.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(pkgRoot, '..', '..');
const fixturesDir = path.join(pkgRoot, 'tests', 'e2e', 'fixtures');

export interface BrowserLastBarBenchResult {
	readonly lastBarBurstUpdate120MsMedian: number;
	readonly lastBarBurstUpdate120MsSamples: readonly number[];
	readonly lastBarBurst120Plus2RafMsMedian: number;
	readonly lastBarBurst120Plus2RafMsSamples: readonly number[];
	readonly lastBarBurstUpdateCount: number;
	readonly lastBarBurstMedianRuns: number;
}

function listenOnRandomPort(listener: http.RequestListener): Promise<{ port: number; close: () => void }> {
	const server = http.createServer(listener);
	return new Promise((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address();
			if (addr === null || typeof addr === 'string') {
				reject(new Error('server address unavailable'));
				return;
			}
			resolve({
				port: addr.port,
				close: () => {
					server.close();
				},
			});
		});
		server.on('error', reject);
	});
}

export async function measureBrowserLastBarMetrics(): Promise<BrowserLastBarBenchResult> {
	assertHarnessAssetsExist({ repoRoot, pkgRoot, fixturesDir });
	const listener = createHarnessAssetListener({ repoRoot, pkgRoot, fixturesDir });
	const { port, close } = await listenOnRandomPort(listener);
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});
	try {
		const page = await browser.newPage();
		await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 60_000 });
		await page.waitForFunction(() => (globalThis as Record<string, unknown>)['__TEST_READY'] === true, {
			timeout: 30_000,
		});
		const raw = (await page.evaluate(async () => {
			const w = globalThis as unknown as { runLastBarBurstPerf?: () => Promise<BrowserLastBarBenchResult> };
			if (typeof w.runLastBarBurstPerf !== 'function') {
				throw new Error('runLastBarBurstPerf not defined on window');
			}
			return w.runLastBarBurstPerf();
		})) as BrowserLastBarBenchResult;
		return raw;
	} finally {
		await browser.close();
		close();
	}
}
