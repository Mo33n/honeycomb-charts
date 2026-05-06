import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeSegmentColumnWidths, MAX_VISIBLE_COLUMNS } from '../src/layout/segment-widths.js';

describe('computeSegmentColumnWidths', () => {
	it('allocates zero width to hidden columns', () => {
		const r = computeSegmentColumnWidths({
			slotWidthPx: 100,
			leftColumns: [
				{ metricId: 'a', kind: 'number', visible: false, weight: 1 },
				{ metricId: 'b', kind: 'number', visible: true, weight: 1 },
			],
			rightColumns: [{ metricId: 'c', kind: 'bar', visible: true, weight: 1 }],
		});
		assert.equal(r.leftWidths[0], 0);
		assert.equal(r.leftWidths[1]! + r.rightWidths[0]!, 100);
	});

	it('never exceeds slot width for proportional weights', () => {
		const r = computeSegmentColumnWidths({
			slotWidthPx: 60,
			leftColumns: [
				{ metricId: 'a', kind: 'number', visible: true, weight: 2 },
				{ metricId: 'b', kind: 'number', visible: true, weight: 1 },
			],
			rightColumns: [],
		});
		const sum = r.leftWidths.reduce((x, y) => x + y, 0);
		assert.ok(sum <= 60);
	});

	it('clamps to MAX_VISIBLE_COLUMNS', () => {
		const many = Array.from({ length: 12 }, (_, i) => ({
			metricId: `m${i}`,
			kind: 'number' as const,
			visible: true,
			weight: 1,
		}));
		const r = computeSegmentColumnWidths({
			slotWidthPx: 80,
			leftColumns: many,
			rightColumns: [],
		});
		assert.equal(r.visibleColumns.length, MAX_VISIBLE_COLUMNS);
		assert.ok(r.clampedColumnCount > 0);
	});
});
