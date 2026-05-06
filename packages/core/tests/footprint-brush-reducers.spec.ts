import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { UTCTimestamp } from 'lightweight-charts';

import {
	filterBarsByFootprintBrush,
	normalizeFootprintBrushInterval,
	resolveDefaultBrushTargetMetricId,
	runFootprintBrushReducers,
} from '../src/brush/footprint-brush-reducers.js';
import type { FootprintBrushInterval } from '../src/brush/footprint-brush-contract.js';
import type { EnrichedCandle } from '../src/schema/types.js';
import type { FootprintSegmentSide } from '../src/options/footprint-series-options.js';

/**
 * Shared hand fixture for HC2-011 golden tests (two UTC bars, four level rows, sparse delta/volume).
 */
function brushReducerFixture(): readonly EnrichedCandle<UTCTimestamp>[] {
	const t0 = 1_700_000_000 as UTCTimestamp;
	const t1 = 1_700_000_300 as UTCTimestamp;
	return [
		{
			time: t0,
			open: 1,
			high: 2,
			low: 0.5,
			close: 1.5,
			levels: [
				{ price: 100, values: { bid: 10, ask: 2, delta: 3 } },
				{ price: 101, values: { bid: -1, ask: 1 } },
			],
		},
		{
			time: t1,
			open: 1,
			high: 2,
			low: 0.5,
			close: 1.5,
			levels: [
				{ price: 100, values: { bid: 5, volume: 100 } },
				{ price: 101, values: { bid: 1, ask: 1 } },
			],
		},
	];
}

const leftFixture: FootprintSegmentSide = {
	columns: [
		{ metricId: 'bid', kind: 'number', visible: true },
		{ metricId: 'ask', kind: 'number', visible: true },
	],
};

describe('resolveDefaultBrushTargetMetricId', () => {
	it('returns first visible left number column', () => {
		assert.equal(resolveDefaultBrushTargetMetricId(leftFixture), 'bid');
	});

	it('returns undefined when no left segment', () => {
		assert.equal(resolveDefaultBrushTargetMetricId(undefined), undefined);
	});
});

describe('normalizeFootprintBrushInterval', () => {
	it('swaps when from > to', () => {
		const a = 100 as UTCTimestamp;
		const b = 200 as UTCTimestamp;
		const n = normalizeFootprintBrushInterval({ from: b, to: a });
		assert.equal(n.from, a);
		assert.equal(n.to, b);
	});
});

describe('filterBarsByFootprintBrush', () => {
	it('includes both bars for inclusive range', () => {
		const bars = brushReducerFixture();
		const interval: FootprintBrushInterval = {
			from: bars[0].time,
			to: bars[1].time,
		};
		assert.equal(filterBarsByFootprintBrush(bars, interval).length, 2);
	});

	it('normalizes reversed endpoints', () => {
		const bars = brushReducerFixture();
		const interval: FootprintBrushInterval = { from: bars[1].time, to: bars[0].time };
		assert.equal(filterBarsByFootprintBrush(bars, interval).length, 2);
	});
});

describe('runFootprintBrushReducers (HC2-011 goldens)', () => {
	const bars = brushReducerFixture();

	it('matches golden sum / max / min for default bid metric', () => {
		const r = runFootprintBrushReducers(bars, ['sum', 'max', 'min'], { leftSegment: leftFixture });
		assert.equal(r.sum, 15);
		assert.equal(r.max, 10);
		assert.equal(r.min, -1);
	});

	it('matches golden deltaSum and volumeSum', () => {
		const r = runFootprintBrushReducers(bars, ['deltaSum', 'volumeSum'], {});
		assert.equal(r.deltaSum, 3);
		assert.equal(r.volumeSum, 100);
	});

	it('matches golden rowCount (distinct time, price)', () => {
		const r = runFootprintBrushReducers(bars, ['rowCount'], {});
		assert.equal(r.rowCount, 4);
	});

	it('uses explicit targetMetricId for sum', () => {
		const r = runFootprintBrushReducers(bars, ['sum'], { targetMetricId: 'ask' });
		assert.equal(r.sum, 4);
	});

	it('returns NaN for max when metric has no finite samples', () => {
		const r = runFootprintBrushReducers(bars, ['max'], { targetMetricId: 'no_such_metric' });
		assert.ok(Number.isNaN(r.max));
	});

	it('deltaSum is NaN when no row defines delta', () => {
		const t = 1_800_000_000 as UTCTimestamp;
		const noDelta: readonly EnrichedCandle<UTCTimestamp>[] = [
			{
				time: t,
				open: 1,
				high: 1,
				low: 1,
				close: 1,
				levels: [{ price: 1, values: { bid: 1 } }],
			},
		];
		const r = runFootprintBrushReducers(noDelta, ['deltaSum'], {});
		assert.ok(Number.isNaN(r.deltaSum));
	});

	it('returns {} for empty bars without throwing', () => {
		const r = runFootprintBrushReducers([], ['sum', 'deltaSum', 'rowCount'], { leftSegment: leftFixture });
		assert.deepEqual(r, {});
	});

	it('returns {} for empty reducerIds', () => {
		const r = runFootprintBrushReducers(bars, [], { leftSegment: leftFixture });
		assert.deepEqual(r, {});
	});

	it('omits sum when no target metric can be resolved', () => {
		const r = runFootprintBrushReducers(bars, ['sum'], {});
		assert.equal(r.sum, undefined);
		assert.deepEqual(Object.keys(r), []);
	});

	it('runs custom reducer once and merges numeric keys', () => {
		const r = runFootprintBrushReducers(bars, ['rowCount', 'custom'], {
			customReducer: (b, ctx) => (ctx === 'x' ? { customLevels: b.reduce((n, bar) => n + bar.levels.length, 0) } : {}),
			customReducerContext: 'x',
		});
		assert.equal(r.rowCount, 4);
		assert.equal(r.customLevels, 4);
	});
});
