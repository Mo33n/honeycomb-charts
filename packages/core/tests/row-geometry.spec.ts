import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRowVerticalBands } from '../src/layout/row-geometry.js';
import type { EnrichedCandle } from '../src/schema/types.js';

function candle(over: Partial<EnrichedCandle<number>> = {}): EnrichedCandle<number> {
	return {
		time: 1 as unknown as number,
		open: 100,
		high: 104,
		low: 98,
		close: 102,
		levels: [],
		...over,
	};
}

describe('buildRowVerticalBands', () => {
	it('returns empty for no levels', () => {
		const bands = buildRowVerticalBands(candle(), [], () => 0);
		assert.equal(bands.length, 0);
	});

	it('produces one band per level', () => {
		const bands = buildRowVerticalBands(
			candle(),
			[
				{ price: 100, values: { v: 1 } },
				{ price: 102, values: { v: 2 } },
			],
			p => p * 2
		);
		assert.equal(bands.length, 2);
	});

	it('completes quickly for 256 rows (smoke)', () => {
		const levels = Array.from({ length: 256 }, (_, i) => ({
			price: 98 + i * (6 / 255),
			values: { x: i },
		}));
		const t0 = performance.now();
		buildRowVerticalBands(candle({ high: 104, low: 98, levels }), levels, p => p);
		const dt = performance.now() - t0;
		assert.ok(dt < 50, `expected <50ms locally, got ${dt}ms`);
	});
});
