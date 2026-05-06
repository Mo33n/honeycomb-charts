import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeEnrichedCandle, MAX_LEVELS_PER_BAR } from '../src/schema/sanitize.js';
import type { EnrichedCandle } from '../src/schema/types.js';

describe('sanitizeEnrichedCandle', () => {
	it('throws on invalid OHLC', () => {
		assert.throws(() =>
			sanitizeEnrichedCandle({
				time: 1 as never,
				open: NaN,
				high: 1,
				low: 1,
				close: 1,
				levels: [],
			} as EnrichedCandle<unknown>)
		);
	});

	it('clamps levels and records dropped count', () => {
		const levels = Array.from({ length: MAX_LEVELS_PER_BAR + 10 }, (_, i) => ({
			price: i,
			values: { a: 1 },
		}));
		const r = sanitizeEnrichedCandle(
			{
				time: 1 as never,
				open: 1,
				high: 2,
				low: 0,
				close: 1,
				levels,
			} as EnrichedCandle<unknown>
		);
		assert.equal(r.candle.levels.length, MAX_LEVELS_PER_BAR);
		assert.ok(r.droppedLevels > 0);
	});

	it('drops non-finite cell values with warning', () => {
		const r = sanitizeEnrichedCandle({
			time: 1 as never,
			open: 1,
			high: 2,
			low: 0,
			close: 1,
			levels: [{ price: 1, values: { ok: 1, bad: NaN } }],
		} as EnrichedCandle<unknown>);
		assert.equal(r.candle.levels[0]!.values['ok'], 1);
		assert.equal(r.candle.levels[0]!.values['bad'], undefined);
		assert.ok(r.warnings.some(w => w.includes('bad')));
	});
});
