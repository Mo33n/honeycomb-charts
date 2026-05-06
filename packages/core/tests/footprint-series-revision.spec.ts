import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PaneRendererCustomData, UTCTimestamp } from 'lightweight-charts';

import { HoneycombSeries } from '../src/series/footprint-series.js';
import type { EnrichedCandle } from '../src/schema/types.js';
import type { HoneycombSeriesOptions } from '../src/options/footprint-series-options.js';
import { defaultHoneycombSeriesOptions } from '../src/options/footprint-series-options.js';

function bar(rev: number): EnrichedCandle<UTCTimestamp> {
	return {
		time: 1000 as UTCTimestamp,
		open: 1,
		high: 2,
		low: 0,
		close: 1,
		revision: rev,
		levels: [{ price: 1, values: { bid: 1, ask: 1, delta: 0 } }],
	};
}

function paneData(): PaneRendererCustomData<UTCTimestamp, EnrichedCandle<UTCTimestamp>> {
	return {
		bars: [
			{ x: 10, time: 0, originalData: bar(1), barColor: '#fff' },
		],
		barSpacing: 6,
		visibleRange: { from: 0, to: 1 },
		conflationFactor: 1,
	};
}

describe('HoneycombSeries onRevision (T-042)', () => {
	it('fires once when revision increases', () => {
		const s = new HoneycombSeries();
		const seen: number[] = [];
		const opts: HoneycombSeriesOptions = {
			...defaultHoneycombSeriesOptions,
			onRevision: ev => {
				seen.push(ev.revision);
			},
		};
		const d = paneData();
		s.update(d, opts);
		s.update(d, opts);
		assert.deepEqual(seen, [1], 'same revision must not duplicate callback');
		s.update(
			{
				...d,
				bars: [{ ...d.bars[0]!, originalData: bar(2) }],
			},
			opts
		);
		assert.deepEqual(seen, [1, 2]);
	});

	it('does not fire when revision omitted', () => {
		const s = new HoneycombSeries();
		let n = 0;
		const opts: HoneycombSeriesOptions = {
			...defaultHoneycombSeriesOptions,
			onRevision: () => {
				n += 1;
			},
		};
		const b: EnrichedCandle<UTCTimestamp> = {
			time: 1000 as UTCTimestamp,
			open: 1,
			high: 2,
			low: 0,
			close: 1,
			levels: [],
		};
		s.update(
			{
				bars: [{ x: 0, time: 0, originalData: b, barColor: '#fff' }],
				barSpacing: 6,
				visibleRange: { from: 0, to: 1 },
				conflationFactor: 1,
			},
			opts
		);
		assert.equal(n, 0);
	});
});
