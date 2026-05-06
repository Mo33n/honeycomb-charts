import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildFootprintLayoutSnapshot, FOOTPRINT_LAYOUT_SNAPSHOT_VERSION } from '../src/export/layout-snapshot.js';

describe('buildFootprintLayoutSnapshot (T-080)', () => {
	it('matches golden structural output', () => {
		const snap = buildFootprintLayoutSnapshot({
			generatedAtMs: 42,
			devicePixelRatio: 2,
			bars: [
				{
					logicalBarIndex: 7,
					revision: 3,
					cells: [
						{ price: 100.5, metricId: 'vol', segment: 'L', text: '1.2K', barNormalized: 0.5 },
					],
				},
			],
		});
		const expected = {
			version: FOOTPRINT_LAYOUT_SNAPSHOT_VERSION,
			generatedAtMs: 42,
			devicePixelRatio: 2,
			bars: [
				{
					logicalBarIndex: 7,
					revision: 3,
					cells: [{ price: 100.5, metricId: 'vol', segment: 'L', text: '1.2K', barNormalized: 0.5 }],
				},
			],
		};
		assert.deepEqual(JSON.parse(JSON.stringify(snap)), expected);
	});

	it('embeds layoutDirection when mirrorSegments (HC1-040)', () => {
		const snap = buildFootprintLayoutSnapshot({
			generatedAtMs: 1,
			devicePixelRatio: 1,
			layoutDirection: 'mirrorSegments',
			bars: [],
		});
		assert.equal(snap.layoutDirection, 'mirrorSegments');
	});

	it('omits layoutDirection for ltr default', () => {
		const snap = buildFootprintLayoutSnapshot({
			generatedAtMs: 1,
			devicePixelRatio: 1,
			layoutDirection: 'ltr',
			bars: [],
		});
		assert.equal(snap.layoutDirection, undefined);
	});
});
