import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { UTCTimestamp } from 'lightweight-charts';

import {
	assertFootprintReplayHasNoFutureBars,
	clampFootprintReplayPlayhead,
	deriveFootprintReplayDomain,
	filterEnrichedCandlesAtOrBeforePlayhead,
} from '../src/replay/footprint-replay-data.js';
import type { EnrichedCandle } from '../src/schema/types.js';

function candle(time: number): EnrichedCandle<UTCTimestamp> {
	return {
		time: time as UTCTimestamp,
		open: 1,
		high: 1,
		low: 1,
		close: 1,
		levels: [{ price: 100, values: { bid: 1 } }],
	};
}

describe('deriveFootprintReplayDomain', () => {
	it('returns null for empty', () => {
		assert.equal(deriveFootprintReplayDomain([]), null);
	});

	it('returns single bar min=max', () => {
		const t = 100 as UTCTimestamp;
		const d = deriveFootprintReplayDomain([candle(100)]);
		assert.deepEqual(d, { firstBarTime: t, lastBarTime: t });
	});

	it('finds min/max when unsorted', () => {
		const bars = [candle(300), candle(100), candle(200)];
		const d = deriveFootprintReplayDomain(bars);
		assert.equal(d?.firstBarTime, 100);
		assert.equal(d?.lastBarTime, 300);
	});
});

describe('clampFootprintReplayPlayhead', () => {
	const domain = { firstBarTime: 10 as UTCTimestamp, lastBarTime: 50 as UTCTimestamp };

	it('returns playhead when inside', () => {
		assert.equal(clampFootprintReplayPlayhead(25 as UTCTimestamp, domain), 25);
	});

	it('clamps low', () => {
		assert.equal(clampFootprintReplayPlayhead(5 as UTCTimestamp, domain), 10);
	});

	it('clamps high', () => {
		assert.equal(clampFootprintReplayPlayhead(99 as UTCTimestamp, domain), 50);
	});
});

describe('filterEnrichedCandlesAtOrBeforePlayhead', () => {
	const bars: EnrichedCandle<UTCTimestamp>[] = [candle(100), candle(200), candle(200), candle(300)];

	it('keeps inclusive playhead and order', () => {
		const f = filterEnrichedCandlesAtOrBeforePlayhead(bars, 200 as UTCTimestamp);
		assert.equal(f.length, 3);
		assert.equal(f[0].time, 100);
		assert.equal(f[1].time, 200);
		assert.equal(f[2].time, 200);
	});

	it('returns empty when all future', () => {
		const f = filterEnrichedCandlesAtOrBeforePlayhead(bars, 50 as UTCTimestamp);
		assert.deepEqual(f, []);
	});

	it('returns full when playhead after all', () => {
		const f = filterEnrichedCandlesAtOrBeforePlayhead(bars, 400 as UTCTimestamp);
		assert.equal(f.length, 4);
	});
});

describe('assertFootprintReplayHasNoFutureBars', () => {
	it('does not throw when contract holds', () => {
		assertFootprintReplayHasNoFutureBars([candle(100), candle(200)], 200 as UTCTimestamp);
	});

	it('throws on future bar', () => {
		assert.throws(
			() =>
				assertFootprintReplayHasNoFutureBars([candle(100), candle(300)], 200 as UTCTimestamp),
			/Footprint replay contract/
		);
	});

	it('throws when playhead is NaN', () => {
		assert.throws(
			() => assertFootprintReplayHasNoFutureBars([candle(100)], Number.NaN as UTCTimestamp),
			/playheadInclusive must be a finite/
		);
	});
});

describe('replay finite-time guards', () => {
	const nanBar: EnrichedCandle<UTCTimestamp> = {
		time: Number.NaN as UTCTimestamp,
		open: 1,
		high: 1,
		low: 1,
		close: 1,
		levels: [{ price: 1, values: { bid: 1 } }],
	};

	it('deriveFootprintReplayDomain throws on non-finite bar time', () => {
		assert.throws(() => deriveFootprintReplayDomain([nanBar]), /non-finite time/);
	});

	it('filterEnrichedCandlesAtOrBeforePlayhead throws on non-finite playhead', () => {
		assert.throws(
			() => filterEnrichedCandlesAtOrBeforePlayhead([candle(100)], Number.NaN as UTCTimestamp),
			/playheadInclusive must be a finite/
		);
	});

	it('filterEnrichedCandlesAtOrBeforePlayhead throws on non-finite bar time', () => {
		assert.throws(
			() => filterEnrichedCandlesAtOrBeforePlayhead([candle(100), nanBar], 200 as UTCTimestamp),
			/non-finite time/
		);
	});

	it('clampFootprintReplayPlayhead throws on non-finite playhead', () => {
		const domain = { firstBarTime: 0 as UTCTimestamp, lastBarTime: 10 as UTCTimestamp };
		assert.throws(
			() => clampFootprintReplayPlayhead(Number.POSITIVE_INFINITY as UTCTimestamp, domain),
			/playhead must be a finite/
		);
	});

	it('clampFootprintReplayPlayhead throws on non-finite domain endpoint', () => {
		const domain = {
			firstBarTime: 0 as UTCTimestamp,
			lastBarTime: Number.NaN as UTCTimestamp,
		};
		assert.throws(() => clampFootprintReplayPlayhead(5 as UTCTimestamp, domain), /lastBarTime must be a finite/);
	});
});
