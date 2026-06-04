import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { compileLayoutCatalog, RENDER_PLAN_VERSION, segmentLayoutRevision } from '../lib/compiler-core.mjs';
import { CompileLayoutError } from '../lib/errors.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const honeycombRoot = join(__dirname, '..');

describe('segmentLayoutRevision', () => {
	it('is stable for generic engine inputs', () => {
		const a = segmentLayoutRevision('desk', 'genericFootprint');
		assert.equal(segmentLayoutRevision('desk', 'genericFootprint'), a);
		assert.equal(typeof a, 'number');
	});
});

describe('compileLayoutCatalog', () => {
	it('compiles minimal generic layout', () => {
		const r = compileLayoutCatalog({
			schemaVersion: '1.0.0',
			layouts: [
				{
					id: 'test_min',
					engine: 'genericFootprint',
					segment: {
						tracks: [{ role: 'number', metricId: 'bid' }],
						trackWeights: [1],
						chrome: { candleStripFraction: 0.1 },
					},
				},
			],
		});
		assert.equal(r.schemaVersion, '1.0.0');
		assert.equal(r.renderPlanVersion, RENDER_PLAN_VERSION);
		assert.equal(r.layouts.length, 1);
		assert.equal(r.layouts[0].id, 'test_min');
		assert.ok(r.layouts[0].lwcGenericFootprintPartial);
		assert.equal(r.layouts[0].lwcGenericFootprintPartial.slots[0].metricId, 'bid');
		assert.deepEqual(r.layouts[0].segmentPlan.requiredKeys, ['bid']);
		assert.equal(r.layouts[0].segmentPlan.segmentPlanVersion, 1);
		assert.equal(
			r.layouts[0].segmentPlan.layoutRevision,
			segmentLayoutRevision('test_min', 'genericFootprint')
		);
		assert.equal(r.index.layouts.length, 1);
	});

	it('supports explicit candle track ordering', () => {
		const r = compileLayoutCatalog({
			schemaVersion: '1.0.0',
			themes: {
				desk_dark: {
					candleWick: 'rgba(1,1,1,1)',
				},
			},
			layouts: [
				{
					id: 'test_candle_track',
					engine: 'genericFootprint',
					themeRef: 'desk_dark',
					segment: {
						tracks: [
							{ role: 'number', metricId: 'ask' },
							{
								role: 'candle',
								candleStripFraction: 0.22,
								candleWick: 'rgba(9,9,9,1)',
							},
							{ role: 'number', metricId: 'bid' },
						],
						trackWeights: [1, 1],
					},
				},
			],
		});
		const L = r.layouts[0];
		assert.equal(L.lwcGenericFootprintPartial.candleLaneVisible, true);
		assert.equal(L.lwcGenericFootprintPartial.candleLaneIndex, 1);
		assert.equal(L.lwcGenericFootprintPartial.candleStripFraction, 0.22);
		assert.equal(L.lwcGenericFootprintPartial.theme.candleWick, 'rgba(9,9,9,1)');
		assert.equal(L.lwcGenericFootprintPartial.slots.length, 2);
	});

	it('supports candle-only layout with zero data tracks', () => {
		const r = compileLayoutCatalog({
			schemaVersion: '1.0.0',
			layouts: [
				{
					id: 'test_candle_only',
					engine: 'genericFootprint',
					segment: {
						tracks: [{ role: 'candle', candleStripFraction: 0.9 }],
						trackWeights: [],
					},
				},
			],
		});
		const L = r.layouts[0];
		assert.equal(L.lwcGenericFootprintPartial.candleLaneVisible, true);
		assert.equal(L.lwcGenericFootprintPartial.slots.length, 0);
		assert.equal(L.segmentPlan.columns.length, 0);
	});

	it('throws UNKNOWN_GENERIC_ROLE', () => {
		assert.throws(
			() =>
				compileLayoutCatalog({
					schemaVersion: '1.0.0',
					layouts: [
						{
							id: 'bad_role',
							engine: 'genericFootprint',
							segment: {
								tracks: [{ role: 'sparkline', metricId: 'x' }],
								trackWeights: [1],
							},
						},
					],
				}),
			e => e instanceof CompileLayoutError && e.code === 'UNKNOWN_GENERIC_ROLE' && e.layoutId === 'bad_role'
		);
	});

	it('throws LAYOUT_DUPLICATE', () => {
		assert.throws(
			() =>
				compileLayoutCatalog({
					schemaVersion: '1.0.0',
					layouts: [
						{ id: 'dup', engine: 'genericFootprint', segment: { tracks: [{ role: 'number', metricId: 'a' }], trackWeights: [1] } },
						{ id: 'dup', engine: 'genericFootprint', segment: { tracks: [{ role: 'number', metricId: 'b' }], trackWeights: [1] } },
					],
				}),
			e => e instanceof CompileLayoutError && e.code === 'LAYOUT_DUPLICATE'
		);
	});

	it('throws TEMPLATE_REF_UNKNOWN', () => {
		assert.throws(
			() =>
				compileLayoutCatalog({
					schemaVersion: '1.0.0',
					templates: {},
					layouts: [
						{
							id: 'bad_tpl',
							engine: 'genericFootprint',
							segment: {
								tracks: [{ templateRef: 'nope', role: 'number', metricId: 'x' }],
								trackWeights: [1],
							},
						},
					],
				}),
			e => e instanceof CompileLayoutError && e.code === 'TEMPLATE_REF_UNKNOWN' && e.layoutId === 'bad_tpl'
		);
	});

	it('throws TRACK_WEIGHT_MISMATCH', () => {
		assert.throws(
			() =>
				compileLayoutCatalog({
					schemaVersion: '1.0.0',
					layouts: [
						{
							id: 'bad_w',
							engine: 'genericFootprint',
							segment: {
								tracks: [
									{ role: 'number', metricId: 'a' },
									{ role: 'number', metricId: 'b' },
								],
								trackWeights: [1],
							},
						},
					],
				}),
			e => e instanceof CompileLayoutError && e.code === 'TRACK_WEIGHT_MISMATCH'
		);
	});

	it('compiles generic heatmapCell track with extra bindings in requiredKeys', () => {
		const r = compileLayoutCatalog({
			schemaVersion: '1.0.0',
			layouts: [
				{
					id: 'test_heat',
					engine: 'genericFootprint',
					segment: {
						tracks: [
							{
								role: 'heatmapCell',
								metricId: 'heat_v',
								colorMode: 'diverging',
								scaleRef: 'desk',
								secondaryMetricId: 'heat_s',
								weightBinding: { key: 'heat_w', scope: 'level' },
							},
						],
						trackWeights: [1],
					},
				},
			],
		});
		const L = r.layouts[0];
		assert.equal(L.lwcGenericFootprintPartial.slots[0].role, 'heatmapCell');
		assert.equal(L.lwcGenericFootprintPartial.slots[0].metricId, 'heat_v');
		assert.deepEqual(L.segmentPlan.requiredKeys, ['heat_s', 'heat_v', 'heat_w']);
		const col = L.segmentPlan.columns[0];
		assert.equal(col.weightBinding.key, 'heat_w');
		assert.equal(col.secondaryBinding.key, 'heat_s');
	});

	it('rejects heatmapCell valueSecondary without secondaryMetricId', () => {
		assert.throws(
			() =>
				compileLayoutCatalog({
					schemaVersion: '1.0.0',
					layouts: [
						{
							id: 'bad_heat',
							engine: 'genericFootprint',
							segment: {
								tracks: [{ role: 'heatmapCell', metricId: 'v', colorMode: 'valueSecondary' }],
								trackWeights: [1],
							},
						},
					],
				}),
			e => e instanceof CompileLayoutError && e.code === 'CATALOG_INVALID' && e.layoutId === 'bad_heat'
		);
	});

	it('compiles overlays on generic track (segmentPlanVersion 2)', () => {
		const r = compileLayoutCatalog({
			schemaVersion: '1.0.0',
			layouts: [
				{
					id: 'ov_layout',
					engine: 'genericFootprint',
					segment: {
						tracks: [
							{
								role: 'number',
								metricId: 'x',
								overlays: [{ id: 'b1', kind: 'cellBand', fill: 'rgba(255,0,0,0.2)', opacity: 0.5, zOrder: 0 }],
							},
						],
						trackWeights: [1],
					},
				},
			],
		});
		assert.equal(r.layouts[0].segmentPlan.segmentPlanVersion, 2);
		assert.equal(r.layouts[0].lwcGenericFootprintPartial.columnOverlays[0][0].id, 'b1');
	});

	it('throws OVERLAY_KIND_UNKNOWN', () => {
		assert.throws(
			() =>
				compileLayoutCatalog({
					schemaVersion: '1.0.0',
					layouts: [
						{
							id: 'bad_ov',
							engine: 'genericFootprint',
							segment: {
								tracks: [{ role: 'number', metricId: 'x', overlays: [{ id: 'a', kind: 'nope', fill: '#fff' }] }],
								trackWeights: [1],
							},
						},
					],
				}),
			e => e instanceof CompileLayoutError && e.code === 'OVERLAY_KIND_UNKNOWN' && e.layoutId === 'bad_ov'
		);
	});

	it('compiles segmentProfileRef into profileSelector', () => {
		const r = compileLayoutCatalog({
			schemaVersion: '1.0.0',
			segmentProfiles: {
				p1: {
					hysteresisPx: 5,
					rules: [
						{ minWidthPx: 0, layoutId: 'narrow_l' },
						{ minWidthPx: 500, layoutId: 'wide_l' },
					],
				},
			},
			layouts: [
				{
					id: 'narrow_l',
					engine: 'genericFootprint',
					segment: { tracks: [{ role: 'number', metricId: 'a' }], trackWeights: [1] },
				},
				{
					id: 'wide_l',
					engine: 'genericFootprint',
					segment: { tracks: [{ role: 'number', metricId: 'b' }], trackWeights: [1] },
				},
				{
					id: 'host_l',
					engine: 'genericFootprint',
					segmentProfileRef: 'p1',
					segment: { tracks: [{ role: 'number', metricId: 'c' }], trackWeights: [1] },
				},
			],
		});
		const host = r.layouts.find(l => l.id === 'host_l');
		assert.ok(host);
		const ps = host.segmentPlan.profileSelector;
		assert.ok(ps);
		assert.equal(ps.hysteresisPx, 5);
		assert.equal(ps.rules[0].layoutId, 'narrow_l');
		assert.equal(ps.rules[1].layoutId, 'wide_l');
		assert.equal(host.segmentPlan.segmentPlanVersion, 2);
	});

	it('throws PROFILE_RULE_LAYOUT_UNKNOWN', () => {
		assert.throws(
			() =>
				compileLayoutCatalog({
					schemaVersion: '1.0.0',
					segmentProfiles: {
						bad: { rules: [{ minWidthPx: 0, layoutId: 'missing_layout' }] },
					},
					layouts: [
						{
							id: 'x',
							engine: 'genericFootprint',
							segmentProfileRef: 'bad',
							segment: { tracks: [{ role: 'number', metricId: 'z' }], trackWeights: [1] },
						},
					],
				}),
			e => e instanceof CompileLayoutError && e.code === 'PROFILE_RULE_LAYOUT_UNKNOWN'
		);
	});

	it('matches production config.json layout count', async () => {
		const raw = JSON.parse(await readFile(join(honeycombRoot, 'config.json'), 'utf8'));
		const r = compileLayoutCatalog(raw);
		assert.equal(r.layouts.length, 13);
		const ids = new Set(r.layouts.map(l => l.id));
		assert.ok(ids.has('desk_dark_orderflow'));
		assert.ok(ids.has('generic_binding_sequence_demo'));
		const desk = r.layouts.find(l => l.id === 'desk_dark_orderflow');
		assert.ok(desk);
		assert.deepEqual(desk.segmentPlan.requiredKeys, ['ask', 'bid', 'delta', 'vol']);
	});
});
