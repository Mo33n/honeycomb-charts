/**
 * Puppeteer smoke: load harness, cell hover, burst update, retainGap setData (T-102).
 *
 * Prerequisites: repo root `npm run build` (development .mjs) and `packages/core` `npm run build`.
 *
 * Run: `npm run test:e2e` from `packages/core`.
 */
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer, { type BoundingBox, type Page } from 'puppeteer';

import { buildFootprintCrosshairPayload, parseFootprintObjectId } from '../../src/interaction/crosshair-adapter.js';
import type { ParsedFootprintHit } from '../../src/interaction/crosshair-adapter.js';
import { assertHarnessAssetsExist, createHarnessAssetListener } from './harness-asset-handler.js';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(e2eDir, '..', '..');
const repoRoot = path.resolve(pkgRoot, '..', '..');
const fixturesDir = path.join(e2eDir, 'fixtures');

function startStaticServer(port: number): Promise<() => void> {
	assertHarnessAssetsExist({ repoRoot, pkgRoot, fixturesDir });
	const listener = createHarnessAssetListener({ repoRoot, pkgRoot, fixturesDir });
	const server = http.createServer(listener);
	return new Promise((resolve, reject) => {
		server.listen(port, '127.0.0.1', () => {
			resolve(() => {
				server.close();
			});
		});
		server.on('error', reject);
	});
}

async function readLastHoverObjectId(page: Page): Promise<string | undefined> {
	return page.evaluate(() => (globalThis as unknown as { __hcLastHoverObjectId?: string }).__hcLastHoverObjectId);
}

async function probeFootprintCellHover(page: Page, box: BoundingBox): Promise<string | undefined> {
	const settleMs = 24;
	for (let px = 0.14; px <= 0.92; px += 0.06) {
		for (let py = 0.1; py <= 0.9; py += 0.07) {
			await page.mouse.move(box.x + box.width * px, box.y + box.height * py);
			await new Promise<void>(r => {
				setTimeout(r, settleMs);
			});
			const id = await readLastHoverObjectId(page);
			if (typeof id === 'string' && id.startsWith('fp|')) {
				return id;
			}
		}
	}
	return undefined;
}

function validateFootprintHoverId(hoverId: string, errors: string[]): void {
	const parsed = parseFootprintObjectId(hoverId);
	if (parsed === null) {
		errors.push(`cell hover: parseFootprintObjectId failed for ${hoverId}`);
		return;
	}
	if (!['bid', 'ask', 'delta'].includes(parsed.metricId)) {
		errors.push(`cell hover: unexpected metricId ${parsed.metricId} in ${hoverId}`);
	}
}

/**
 * Expected metric value for harness `INITIAL_HARNESS_DATA`.
 * `objectId` slot 1 follows `PaneRendererCustomData` bar `time` field (logical bar index at runtime for this chart).
 */
function expectedHarnessCellValue(parsed: ParsedFootprintHit): number | null {
	const logical = parsed.logicalBarIndex;
	const { price, metricId } = parsed;
	let row: Record<string, number> | null = null;
	if (logical === 0) {
		if (price === 100) {
			row = { bid: 50, ask: 30, delta: 20 };
		} else if (price === 101) {
			row = { bid: 10, ask: 40, delta: -30 };
		}
	} else if (logical === 1 && price === 101) {
		row = { bid: 20, ask: 20, delta: 0 };
	}
	if (row === null) {
		return null;
	}
	const v = row[metricId];
	return typeof v === 'number' ? v : null;
}

function validateCrosshairPayloadValue(hoverId: string, errors: string[]): void {
	const parsed = parseFootprintObjectId(hoverId);
	if (parsed === null) {
		return;
	}
	const expected = expectedHarnessCellValue(parsed);
	if (expected === null) {
		errors.push(`cell hover: no fixture value for ${hoverId} (sync harness data if chart changed)`);
		return;
	}
	const payload = buildFootprintCrosshairPayload(hoverId, { value: expected });
	if (payload === null) {
		errors.push(`cell hover: buildFootprintCrosshairPayload returned null for ${hoverId}`);
		return;
	}
	if (payload.value !== expected) {
		errors.push(`cell hover: payload value mismatch for ${hoverId}`);
	}
	if (payload.metricId !== parsed.metricId || payload.price !== parsed.price) {
		errors.push(`cell hover: payload field mismatch for ${hoverId}`);
	}
}

function appendRetainGapWidthErrors(widthResult: Record<string, unknown>, errors: string[]): void {
	const err = widthResult['error'];
	if (typeof err === 'string') {
		errors.push(`retainGap width: ${err}`);
		return;
	}
	const px0 = Number(widthResult['pxWhitespaceToFirst']);
	const px1 = Number(widthResult['pxFirstToSecond']);
	const s01 = Number(widthResult['logicalStep01']);
	const s12 = Number(widthResult['logicalStep12']);
	if (!Number.isFinite(px0) || !Number.isFinite(px1)) {
		errors.push(`retainGap width: non-finite px ${JSON.stringify(widthResult)}`);
		return;
	}
	const tolPx = 1.75;
	if (Math.abs(px0 - px1) > tolPx) {
		errors.push(
			`retainGap width: whitespace→first (${px0.toFixed(3)}px) vs first→second (${px1.toFixed(3)}px) exceeds ${tolPx}px`
		);
	}
	if (s01 !== 1 || s12 !== 1) {
		errors.push(`retainGap width: expected logical steps 1, got ${s01}, ${s12}`);
	}
}

async function main(): Promise<void> {
	const port = 41789 + Math.floor(Math.random() * 200);
	const stop = await startStaticServer(port);
	const base = `http://127.0.0.1:${port}/`;

	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
	});
	const errors: string[] = [];
	try {
		const page = await browser.newPage();
		page.on('pageerror', err => {
			errors.push(`pageerror: ${String(err)}`);
		});
		page.on('console', msg => {
			if (msg.type() !== 'error') {
				return;
			}
			const text = msg.text();
			if (text.includes('Failed to load resource')) {
				return;
			}
			errors.push(`console.error: ${text}`);
		});

		// `load` can flake when a subresource stalls; harness readiness is asserted next.
		await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
		await page.waitForFunction(() => (globalThis as unknown as { __TEST_READY?: boolean }).__TEST_READY === true, {
			timeout: 60_000,
		});

		const canvasBox = await page.evaluate(() => {
			const c = document.querySelector('canvas');
			if (!c) {
				return null;
			}
			const r = c.getBoundingClientRect();
			return { w: r.width, h: r.height };
		});
		if (canvasBox === null || canvasBox.w < 10 || canvasBox.h < 10) {
			errors.push(`unexpected canvas size: ${JSON.stringify(canvasBox)}`);
		}

		const canvas = await page.$('canvas');
		const box = canvas !== null ? await canvas.boundingBox() : null;
		if (box === null) {
			errors.push('canvas bounding box unavailable');
		} else {
			const hoverId = await probeFootprintCellHover(page, box);
			if (hoverId === undefined) {
				errors.push('cell hover: no footprint objectId hit after canvas probe');
			} else {
				validateFootprintHoverId(hoverId, errors);
				validateCrosshairPayloadValue(hoverId, errors);
			}
		}

		await page.evaluate(() => {
			const w = globalThis as unknown as { runBurstUpdates?: () => void };
			w.runBurstUpdates?.();
		});

		await page.evaluate(() => {
			const w = globalThis as unknown as { runRetainGapSeries?: () => void };
			w.runRetainGapSeries?.();
		});

		const widthResult = (await page.evaluate(() => {
			const w = globalThis as unknown as { measureRetainGapSlotWidths?: () => Record<string, unknown> };
			return w.measureRetainGapSlotWidths?.() ?? { error: 'measureRetainGapSlotWidths missing' };
		})) as Record<string, unknown>;
		appendRetainGapWidthErrors(widthResult, errors);

		await page.evaluate(() => {
			const w = globalThis as unknown as { resetFootprintHarnessData?: () => void };
			w.resetFootprintHarnessData?.();
		});
		const patchBid = await page.evaluate(() => {
			const w = globalThis as unknown as { runApplyLevelPatchSmoke?: () => number | null };
			return w.runApplyLevelPatchSmoke?.() ?? null;
		});
		if (patchBid !== 999) {
			errors.push(`applyLevelPatch smoke: expected bid 999 on patched row, got ${String(patchBid)}`);
		}

		if (errors.length > 0) {
			throw new Error(errors.join('\n'));
		}
		console.log('footprint e2e: ok');
	} finally {
		await browser.close();
		stop();
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
