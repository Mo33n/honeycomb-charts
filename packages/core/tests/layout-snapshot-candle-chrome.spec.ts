import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildFootprintLayoutSnapshot } from '../src/export/layout-snapshot.js';

describe('layout snapshot candle chrome flags (T-033)', () => {
	const baseBar = {
		logicalBarIndex: 0,
		cells: [{ price: 100, metricId: 'bid', segment: 'L' as const, text: '1', barNormalized: 0 }],
	};

	it('embeds candleChrome when provided', () => {
		const a = buildFootprintLayoutSnapshot({
			generatedAtMs: 1,
			devicePixelRatio: 1,
			bars: [baseBar],
			candleChrome: { bodyVisible: true, wicksVisible: true, candleZOrder: 'behind' },
		});
		const b = buildFootprintLayoutSnapshot({
			generatedAtMs: 1,
			devicePixelRatio: 1,
			bars: [baseBar],
			candleChrome: { bodyVisible: false, wicksVisible: false, candleZOrder: 'outlineFront' },
		});
		assert.equal(a.candleChrome?.candleZOrder, 'behind');
		assert.equal(b.candleChrome?.bodyVisible, false);
		assert.equal(b.candleChrome?.candleZOrder, 'outlineFront');
		assert.notDeepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
	});

	it('omits candleChrome when not provided (backward compatible)', () => {
		const s = buildFootprintLayoutSnapshot({
			generatedAtMs: 1,
			devicePixelRatio: 1,
			bars: [baseBar],
		});
		assert.equal(s.candleChrome, undefined);
	});
});
