import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import {
	TextMeasureCache,
	resetTextMeasureCacheDevStats,
	getTextMeasureCacheDevEvictionCount,
} from '../src/render/text-measure-cache.js';

function mockCtx(): Pick<CanvasRenderingContext2D, 'measureText'> {
	return {
		measureText: (s: string) => ({ width: s.length * 6 }),
	};
}

describe('TextMeasureCache (T-034)', () => {
	let ctx: CanvasRenderingContext2D;

	beforeEach(() => {
		resetTextMeasureCacheDevStats();
		ctx = mockCtx() as unknown as CanvasRenderingContext2D;
	});

	it('evicts when over capacity without throwing', () => {
		const cache = new TextMeasureCache(3);
		cache.measure(ctx, 'k1', 'a');
		cache.measure(ctx, 'k2', 'bb');
		cache.measure(ctx, 'k3', 'ccc');
		cache.measure(ctx, 'k4', 'dddd');
		assert.ok(cache.size() <= 3);
	});

	it('records dev evictions in non-production', () => {
		const prev = process.env['NODE_ENV'];
		process.env['NODE_ENV'] = 'development';
		resetTextMeasureCacheDevStats();
		const cache = new TextMeasureCache(1);
		cache.measure(ctx, 'a', 'x');
		cache.measure(ctx, 'b', 'y');
		assert.ok(getTextMeasureCacheDevEvictionCount() >= 1);
		process.env['NODE_ENV'] = prev;
	});
});
