/**
 * HC1-010: {@link applyFootprintLevelPatch} — mock `series` avoids full chart (HC1-011 adds structural sharing / perf).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	applyFootprintLevelPatch,
	mergeLevelsStructural,
	type FootprintPatchSeriesApi,
} from '../src/pipeline/apply-level-patch.js';
import type { EnrichedCandle } from '../src/schema/types.js';
import type { HoneycombSeriesOptions } from '../src/options/footprint-series-options.js';
import { defaultHoneycombSeriesOptions } from '../src/options/footprint-series-options.js';

const baseOptions: HoneycombSeriesOptions = {
	...defaultHoneycombSeriesOptions,
	left: {
		columns: [
			{ metricId: 'bid', kind: 'number', visible: true, weight: 1 },
			{ metricId: 'ask', kind: 'number', visible: true, weight: 1 },
		],
	},
	right: {
		columns: [{ metricId: 'delta', kind: 'bar', visible: true, weight: 1 }],
	},
};

function mockSeries(
	initial: EnrichedCandle<number>,
	options: HoneycombSeriesOptions = baseOptions
): {
	api: FootprintPatchSeriesApi<number>;
	latest: () => EnrichedCandle<number>;
} {
	let store: EnrichedCandle<number> = { ...initial, levels: initial.levels.map(l => ({ ...l, values: { ...l.values } })) };
	return {
		api: {
			data: () => [store] as const,
			update: (c: EnrichedCandle<number>) => {
				store = { ...c, levels: c.levels.map(l => ({ ...l, values: { ...l.values } })) };
			},
			options: () => options,
		},
		latest: () => store,
	};
}

test('applyFootprintLevelPatch merges allowed metric into existing price row', () => {
	const t = 1000;
	const { api, latest } = mockSeries({
		time: t,
		open: 1,
		high: 2,
		low: 0,
		close: 1.5,
		revision: 1,
		levels: [{ price: 10, values: { bid: 1, ask: 2, delta: -1 } }],
	});
	applyFootprintLevelPatch(api, { time: t, price: 10, values: { bid: 99 } });
	const c = latest();
	assert.equal(c.levels[0]!.values['bid'], 99);
	assert.equal(c.levels[0]!.values['ask'], 2);
	assert.equal(c.revision, 1);
});

test('applyFootprintLevelPatch ignores unknown metricId keys in patch', () => {
	const t = 1000;
	const { api, latest } = mockSeries({
		time: t,
		open: 1,
		high: 2,
		low: 0,
		close: 1,
		levels: [{ price: 10, values: { bid: 1, ask: 1, delta: 0 } }],
	});
	applyFootprintLevelPatch(api, { time: t, price: 10, values: { rogueMetric: 123, bid: 5 } });
	assert.equal(latest().levels[0]!.values['bid'], 5);
	assert.equal(latest().levels[0]!.values['rogueMetric'], undefined);
});

test('applyFootprintLevelPatch bumps revision when provided', () => {
	const t = 1000;
	const { api, latest } = mockSeries({
		time: t,
		open: 1,
		high: 2,
		low: 0,
		close: 1,
		revision: 2,
		levels: [{ price: 10, values: { bid: 1, ask: 1, delta: 0 } }],
	});
	applyFootprintLevelPatch(api, { time: t, price: 10, values: { bid: 2 }, revision: 3 });
	assert.equal(latest().revision, 3);
});

test('applyFootprintLevelPatch throws when revision decreases', () => {
	const t = 1000;
	const { api } = mockSeries({
		time: t,
		open: 1,
		high: 2,
		low: 0,
		close: 1,
		revision: 5,
		levels: [{ price: 10, values: { bid: 1, ask: 1, delta: 0 } }],
	});
	assert.throws(
		() => applyFootprintLevelPatch(api, { time: t, price: 10, values: { bid: 2 }, revision: 4 }),
		RangeError
	);
});

test('applyFootprintLevelPatch appends new price row when allowed keys present', () => {
	const t = 1000;
	const { api, latest } = mockSeries({
		time: t,
		open: 1,
		high: 2,
		low: 0,
		close: 1,
		levels: [{ price: 10, values: { bid: 1, ask: 1, delta: 0 } }],
	});
	applyFootprintLevelPatch(api, { time: t, price: 11, values: { ask: 7 } });
	const c = latest();
	assert.equal(c.levels.length, 2);
	const row = c.levels.find(l => l.price === 11);
	assert.ok(row);
	assert.equal(row!.values['ask'], 7);
});

test('applyFootprintLevelPatch allows revision equal to existing (idempotent bump)', () => {
	const t = 1000;
	const { api, latest } = mockSeries({
		time: t,
		open: 1,
		high: 2,
		low: 0,
		close: 1,
		revision: 4,
		levels: [{ price: 10, values: { bid: 1, ask: 1, delta: 0 } }],
	});
	applyFootprintLevelPatch(api, { time: t, price: 10, values: { bid: 2 }, revision: 4 });
	assert.equal(latest().revision, 4);
	assert.equal(latest().levels[0]!.values['bid'], 2);
});

test('applyFootprintLevelPatch skips non-finite patch numbers', () => {
	const t = 1000;
	const { api, latest } = mockSeries({
		time: t,
		open: 1,
		high: 2,
		low: 0,
		close: 1,
		levels: [{ price: 10, values: { bid: 1, ask: 1, delta: 0 } }],
	});
	applyFootprintLevelPatch(api, { time: t, price: 10, values: { bid: Number.NaN, ask: 3 } });
	assert.equal(latest().levels[0]!.values['bid'], 1);
	assert.equal(latest().levels[0]!.values['ask'], 3);
});

test('applyFootprintLevelPatch throws when no bar at time', () => {
	const { api } = mockSeries({
		time: 1,
		open: 1,
		high: 1,
		low: 1,
		close: 1,
		levels: [{ price: 10, values: { bid: 1, ask: 1, delta: 0 } }],
	});
	assert.throws(() => applyFootprintLevelPatch(api, { time: 999, price: 10, values: { bid: 1 } }), RangeError);
});

/** HC1-011: merge step reuses row refs; `sanitizeEnrichedCandle` still clones for storage. */
test('mergeLevelsStructural reuses references for unpatched level rows', () => {
	const row10 = { price: 10, values: { bid: 1, ask: 2, delta: -1 } };
	const row11 = { price: 11, values: { bid: 3, ask: 4, delta: -1 } };
	const levels = [row10, row11];
	const next = mergeLevelsStructural(levels, 0, { ...row10.values, bid: 99 });
	assert.notEqual(next[0], row10);
	assert.equal(next[0]!.values.bid, 99);
	assert.equal(next[1], row11);
});
