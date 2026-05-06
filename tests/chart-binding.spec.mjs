import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';

import { addHoneycombLayoutSeries, applyMutationToSeries, createHoneycombChartBinding } from '../lib/chart-binding.mjs';
import { CompileLayoutError } from '../lib/errors.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');
const honeycombRuntimeIndex = join(honeycombRoot, 'packages/core/dist/index.js');

describe('addHoneycombLayoutSeries', () => {
	it('throws CHART_BINDING_INVALID without addCustomSeries', () => {
		assert.throws(
			() => addHoneycombLayoutSeries({}, 'x', { schemaVersion: '1.0.0', layouts: [] }, /** @type {any} */ ({})),
			e => e instanceof CompileLayoutError && e.code === 'CHART_BINDING_INVALID'
		);
	});

	it('throws LAYOUT_NOT_FOUND for unknown id', async () => {
		const hc = await import(pathToFileURL(honeycombRuntimeIndex).href);
		const catalog = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		const chart = { addCustomSeries: () => ({}) };
		assert.throws(
			() => addHoneycombLayoutSeries(chart, 'no_such_layout', catalog, hc),
			e => e instanceof CompileLayoutError && e.code === 'LAYOUT_NOT_FOUND'
		);
	});

	it('binds genericFootprint layout with merged options', async () => {
		const hc = await import(pathToFileURL(honeycombRuntimeIndex).href);
		const catalog = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		let received = /** @type {{ series: unknown; opts: Record<string, unknown> } | null} */ (null);
		const chart = {
			addCustomSeries(series, opts) {
				received = { series, opts };
				return { handle: 'generic' };
			},
		};
		const ret = addHoneycombLayoutSeries(chart, 'desk_dark_delta_vol_hist', catalog, hc);
		assert.deepEqual(ret, { handle: 'generic' });
		assert.ok(received);
		assert.ok(received.series instanceof hc.GenericFootprintSeries);
		assert.equal(Array.isArray(received.opts.slots), true);
		assert.equal(received.opts.slots.length, 3);
		assert.equal(typeof received.opts.honeycombLayoutRevision, 'number');
	});

	it('merges userSeriesOptions after layout (e.g. priceFormat)', async () => {
		const hc = await import(pathToFileURL(honeycombRuntimeIndex).href);
		const catalog = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		let received = /** @type {{ series: unknown; opts: Record<string, unknown> } | null} */ (null);
		const chart = {
			addCustomSeries(series, opts) {
				received = { series, opts };
				return { handle: 'generic-pf' };
			},
		};
		const priceFormat = { type: 'price', precision: 3, minMove: 0.001 };
		addHoneycombLayoutSeries(chart, 'desk_dark_delta_vol_hist', catalog, hc, { priceFormat });
		assert.ok(received);
		assert.deepEqual(received.opts.priceFormat, priceFormat);
	});

	it('binds migrated delta-bar layout with generic options', async () => {
		const hc = await import(pathToFileURL(honeycombRuntimeIndex).href);
		const catalog = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		let received = /** @type {{ series: unknown; opts: Record<string, unknown> } | null} */ (null);
		const chart = {
			addCustomSeries(series, opts) {
				received = { series, opts };
				return { handle: 'generic-delta' };
			},
		};
		const ret = addHoneycombLayoutSeries(chart, 'light_bid_ask_delta_bar', catalog, hc);
		assert.deepEqual(ret, { handle: 'generic-delta' });
		assert.ok(received);
		assert.ok(received.series instanceof hc.GenericFootprintSeries);
		assert.ok(Array.isArray(received.opts.slots));
		assert.equal(typeof received.opts.honeycombLayoutRevision, 'number');
	});
});

describe('createHoneycombChartBinding', () => {
	it('swapLayout removes the old series and clears revision map', async () => {
		const hc = await import(pathToFileURL(honeycombRuntimeIndex).href);
		const catalog = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		const removed = [];
		const chart = {
			addCustomSeries() {
				return { tag: `s${removed.length}` };
			},
			removeSeries(s) {
				removed.push(s);
			},
		};
		const b = createHoneycombChartBinding(chart, catalog, hc, 'desk_dark_delta_vol_hist');
		assert.equal(b.layoutId, 'desk_dark_delta_vol_hist');
		assert.equal(b.profileHostLayoutId, null);
		assert.equal(b.onViewportWidthCss(900), null);
		b.lastRevisionByCandleId.set(1, 5);
		const next = b.swapLayout('desk_dark_vol_ratio_delta');
		assert.equal(removed.length, 1);
		assert.equal(removed[0].tag, 's0');
		assert.equal(b.layoutId, 'desk_dark_vol_ratio_delta');
		assert.equal(b.lastRevisionByCandleId.size, 0);
		assert.ok(next && typeof next === 'object');
	});

	it('onViewportWidthCss swaps via segmentPlan.profileSelector (CT-P2-11)', async () => {
		const hc = await import(pathToFileURL(honeycombRuntimeIndex).href);
		const catalog = {
			schemaVersion: '1.0.0',
			segmentProfiles: {
				pf: {
					hysteresisPx: 10,
					rules: [
						{ minWidthPx: 0, layoutId: 'prof_a' },
						{ minWidthPx: 500, layoutId: 'prof_b' },
					],
				},
			},
			layouts: [
				{
					id: 'prof_a',
					engine: 'genericFootprint',
					segment: { tracks: [{ role: 'number', metricId: 'xa' }], trackWeights: [1] },
				},
				{
					id: 'prof_b',
					engine: 'genericFootprint',
					segment: { tracks: [{ role: 'number', metricId: 'xb' }], trackWeights: [1] },
				},
				{
					id: 'prof_host',
					engine: 'genericFootprint',
					segmentProfileRef: 'pf',
					segment: { tracks: [{ role: 'number', metricId: 'xc' }], trackWeights: [1] },
				},
			],
		};
		const removed = [];
		const chart = {
			addCustomSeries() {
				return { tag: `s${removed.length}` };
			},
			removeSeries(s) {
				removed.push(s);
			},
		};
		const b = createHoneycombChartBinding(chart, catalog, hc, 'prof_host', { initialViewportWidthCss: 0 });
		assert.equal(b.layoutId, 'prof_a');
		assert.equal(b.profileHostLayoutId, 'prof_host');
		assert.equal(b.segmentPlanVersion, 1);
		assert.equal(b.hasProfileSelector, false);
		assert.equal(b.hasColumnOverlays, false);
		const w1 = b.onViewportWidthCss(520);
		assert.equal(w1, 'prof_b');
		assert.equal(b.layoutId, 'prof_b');
		assert.equal(removed.length, 1);
		const w2 = b.onViewportWidthCss(480);
		assert.equal(w2, 'prof_a');
		assert.equal(b.layoutId, 'prof_a');
		assert.equal(removed.length, 2);
	});

	it('exposes segmentPlan v2 consumer metadata and refreshes on swap', async () => {
		const hc = await import(pathToFileURL(honeycombRuntimeIndex).href);
		const catalog = {
			schemaVersion: '1.0.0',
			segmentProfiles: {
				pf: {
					hysteresisPx: 8,
					rules: [
						{ minWidthPx: 0, layoutId: 'base_v1' },
						{ minWidthPx: 500, layoutId: 'ov_v2' },
					],
				},
			},
			layouts: [
				{
					id: 'base_v1',
					engine: 'genericFootprint',
					segment: { tracks: [{ role: 'number', metricId: 'a' }], trackWeights: [1] },
				},
				{
					id: 'ov_v2',
					engine: 'genericFootprint',
					segment: {
						tracks: [{ role: 'number', metricId: 'b', overlays: [{ id: 'x', kind: 'cellBand', fill: 'rgba(0,0,255,0.2)' }] }],
						trackWeights: [1],
					},
				},
				{
					id: 'host_v2',
					engine: 'genericFootprint',
					segmentProfileRef: 'pf',
					segment: { tracks: [{ role: 'number', metricId: 'c' }], trackWeights: [1] },
				},
			],
		};
		const chart = {
			addCustomSeries() {
				return {};
			},
			removeSeries() {},
		};
		const b = createHoneycombChartBinding(chart, catalog, hc, 'host_v2', { initialViewportWidthCss: 0 });
		assert.equal(b.profileHostLayoutId, 'host_v2');
		assert.equal(b.segmentPlanVersion, 1);
		assert.equal(b.hasColumnOverlays, false);
		assert.equal(b.hasProfileSelector, false);
		assert.equal(b.onViewportWidthCss(520), 'ov_v2');
		assert.equal(b.layoutId, 'ov_v2');
		assert.equal(b.segmentPlanVersion, 2);
		assert.equal(b.hasColumnOverlays, true);
		assert.equal(b.hasProfileSelector, false);
		assert.equal(b.onViewportWidthCss(0), 'base_v1');
		assert.equal(b.segmentPlanVersion, 1);
		assert.equal(b.hasColumnOverlays, false);
		assert.equal(b.hasProfileSelector, false);
	});
});

describe('applyMutationToSeries (CT-U04 synthetic stream)', () => {
	function makeBar(t) {
		return {
			time: t,
			open: 100,
			high: 101,
			low: 99,
			close: 100,
			levels: [{ price: 100, values: { bid: 1, ask: 1, delta: 0 } }],
		};
	}

	function createMockSeries(initial) {
		let bars = structuredClone(initial);
		return {
			data: () => bars,
			update(bar) {
				const i = bars.findIndex(b => b.time === bar.time);
				if (i >= 0) {
					bars[i] = bar;
				}
			},
			setData(next) {
				bars = next.slice();
			},
		};
	}

	it('50×15 stream: each bar delta ends at 15 (update mode)', () => {
		const bars = Array.from({ length: 50 }, (_, i) => makeBar(1_000 + i));
		const series = createMockSeries(bars);
		for (let b = 0; b < 50; b++) {
			const candleId = 1_000 + b;
			for (let k = 0; k < 15; k++) {
				const r = applyMutationToSeries(series, candleId, {
					ops: [{ op: 'add', path: 'levels.0.values.delta', delta: 1 }],
				});
				assert.equal(r.applied, true);
			}
		}
		for (let b = 0; b < 50; b++) {
			assert.equal(series.data()[b].levels[0].values.delta, 15);
		}
	});

	it('50×15 stream with setData mode', () => {
		const bars = Array.from({ length: 50 }, (_, i) => makeBar(2_000 + i));
		const series = createMockSeries(bars);
		for (let b = 0; b < 50; b++) {
			const candleId = 2_000 + b;
			for (let k = 0; k < 15; k++) {
				applyMutationToSeries(
					series,
					candleId,
					{ ops: [{ op: 'add', path: 'levels.0.values.delta', delta: 1 }] },
					{ mode: 'setData' }
				);
			}
		}
		for (let b = 0; b < 50; b++) {
			assert.equal(series.data()[b].levels[0].values.delta, 15);
		}
	});

	it('returns stale_revision without calling update', () => {
		const series = createMockSeries([makeBar(3_000)]);
		let updates = 0;
		const wrapped = {
			data: series.data,
			update(bar) {
				updates++;
				series.update(bar);
			},
		};
		const rev = new Map();
		assert.equal(applyMutationToSeries(wrapped, 3_000, { revision: 1, ops: [{ op: 'add', path: 'levels.0.values.delta', delta: 10 }] }, { lastRevisionByCandleId: rev }).applied, true);
		const second = applyMutationToSeries(wrapped, 3_000, { revision: 1, ops: [{ op: 'add', path: 'levels.0.values.delta', delta: 99 }] }, { lastRevisionByCandleId: rev });
		assert.equal(second.applied, false);
		assert.equal(second.reason, 'stale_revision');
		assert.equal(updates, 1);
		assert.equal(wrapped.data()[0].levels[0].values.delta, 10);
	});

	it('throws MUTATION_BAR_NOT_FOUND', () => {
		const series = createMockSeries([makeBar(4_000)]);
		assert.throws(
			() => applyMutationToSeries(series, 9_999, { ops: [{ op: 'set', path: 'close', value: 1 }] }),
			e => e instanceof CompileLayoutError && e.code === 'MUTATION_BAR_NOT_FOUND'
		);
	});
});
