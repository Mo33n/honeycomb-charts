import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { UTCTimestamp } from 'lightweight-charts';

import {
	filterBarsByFootprintBrush,
	runFootprintBrushReducers,
} from '../src/brush/footprint-brush-reducers.js';
import { defaultHoneycombSeriesOptions } from '../src/options/footprint-series-options.js';
import type { FootprintBrushInterval } from '../src/brush/footprint-brush-contract.js';
import type { EnrichedCandle } from '../src/schema/types.js';

/** Three-bar slice: two footprint-dense bars and one **empty `levels`** bar (logical / retain-gap style stand-in). */
function integrationBrushBars(): readonly EnrichedCandle<UTCTimestamp>[] {
	const t0 = 1_710_000_000 as UTCTimestamp;
	const t1 = 1_710_008_640 as UTCTimestamp;
	const t2 = 1_710_017_280 as UTCTimestamp;
	return [
		{
			time: t0,
			open: 100,
			high: 102,
			low: 99,
			close: 101,
			levels: [
				{ price: 100, values: { bid: 10, ask: 5, delta: 5 } },
				{ price: 101, values: { bid: 2, ask: 8, delta: -6 } },
			],
		},
		{
			time: t1,
			open: 101,
			high: 101,
			low: 101,
			close: 101,
			levels: [],
		},
		{
			time: t2,
			open: 101,
			high: 103,
			low: 100,
			close: 102,
			levels: [{ price: 101, values: { bid: 40, ask: 10, delta: 30, volume: 99 } }],
		},
	];
}

const left = defaultHoneycombSeriesOptions.left;
const reducerList = ['sum', 'rowCount', 'deltaSum', 'volumeSum'] as const;

describe('footprint brush integration (HC2-013)', () => {
	const bars = integrationBrushBars();
	const t0 = bars[0].time;
	const t1 = bars[1].time;
	const t2 = bars[2].time;

	it('single-bar brush: one timestamp in interval', () => {
		const interval: FootprintBrushInterval = { from: t0, to: t0 };
		const slice = filterBarsByFootprintBrush(bars, interval);
		assert.equal(slice.length, 1);
		const r = runFootprintBrushReducers(slice, [...reducerList], {
			leftSegment: left,
			targetMetricId: 'bid',
		});
		assert.equal(r.sum, 12);
		assert.equal(r.rowCount, 2);
		assert.equal(r.deltaSum, -1);
		assert.ok(Number.isNaN(r.volumeSum));
	});

	it('two-bar brush: dense + empty-levels bar', () => {
		const interval: FootprintBrushInterval = { from: t0, to: t1 };
		const slice = filterBarsByFootprintBrush(bars, interval);
		assert.equal(slice.length, 2);
		const r = runFootprintBrushReducers(slice, [...reducerList], {
			leftSegment: left,
			targetMetricId: 'bid',
		});
		assert.equal(r.sum, 12);
		assert.equal(r.rowCount, 2);
		assert.equal(r.deltaSum, -1);
		assert.ok(Number.isNaN(r.volumeSum));
	});

	it('three-bar brush: includes empty-levels logical bucket', () => {
		const interval: FootprintBrushInterval = { from: t0, to: t2 };
		const slice = filterBarsByFootprintBrush(bars, interval);
		assert.equal(slice.length, 3);
		const r = runFootprintBrushReducers(slice, [...reducerList], {
			leftSegment: left,
			targetMetricId: 'bid',
		});
		assert.equal(r.sum, 52);
		assert.equal(r.rowCount, 3);
		assert.equal(r.deltaSum, 29);
		assert.equal(r.volumeSum, 99);
	});
});
