/**
 * HC1-040: CSS px space (same convention as `FootprintRenderer` — bar `x` is slot **center**).
 * With unequal L/R segment widths, **per-column** edge reflection about center is not required;
 * **segment** bounding boxes (union of that segment’s columns) reflect about `centerCssX` within
 * **±0.5 CSS px**, and `mirrorSegments` paints the **right** segment before the **left** (smaller `x` first).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeFootprintColumnCssSlots } from '../src/layout/footprint-column-css-slots.js';
import type { FootprintSegmentSide } from '../src/options/footprint-series-options.js';

const tol = 0.5;

function reflectX(x: number, centerCssX: number): number {
	return 2 * centerCssX - x;
}

function segmentXBounds(slots: readonly { segment: string; colLeftCss: number; colRightCss: number }[], seg: string): { min: number; max: number } {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const s of slots) {
		if (s.segment !== seg) {
			continue;
		}
		min = Math.min(min, s.colLeftCss);
		max = Math.max(max, s.colRightCss);
	}
	return { min, max };
}

describe('mirrorSegments column layout (HC1-040)', () => {
	const left: FootprintSegmentSide = {
		columns: [
			{ metricId: 'bid', kind: 'number', visible: true, weight: 1 },
			{ metricId: 'ask', kind: 'number', visible: true, weight: 1 },
		],
	};
	const right: FootprintSegmentSide = {
		columns: [{ metricId: 'delta', kind: 'bar', visible: true, weight: 1 }],
	};

	it('reflects L and R segment bounds about bar center; R paints before L in mirror', () => {
		const centerCssX = 200;
		const slotCss = 96;
		const ltr = computeFootprintColumnCssSlots(centerCssX, slotCss, 'ltr', left, right);
		const mir = computeFootprintColumnCssSlots(centerCssX, slotCss, 'mirrorSegments', left, right);

		for (const seg of ['L', 'R'] as const) {
			const a = segmentXBounds(ltr, seg);
			const b = segmentXBounds(mir, seg);
			assert.ok(Number.isFinite(a.min) && Number.isFinite(b.min), `segment ${seg} bounds`);
			assert.ok(
				Math.abs(reflectX(a.max, centerCssX) - b.min) <= tol,
				`segment ${seg} reflected max→min`
			);
			assert.ok(
				Math.abs(reflectX(a.min, centerCssX) - b.max) <= tol,
				`segment ${seg} reflected min→max`
			);
		}

		const firstMir = mir[0];
		const lastMir = mir[mir.length - 1]!;
		assert.equal(firstMir.segment, 'R');
		assert.equal(lastMir.segment, 'L');
		assert.ok(firstMir.colLeftCss < lastMir.colLeftCss, 'right segment occupies smaller x than left');
	});
});
