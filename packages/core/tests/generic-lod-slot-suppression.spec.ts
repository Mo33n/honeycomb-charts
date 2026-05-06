import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defaultGenericFootprintSeriesOptions } from '../src/options/generic-footprint-series-options.js';
import { shouldHideGenericSlotForLod } from '../src/render/generic-footprint-renderer.js';

describe('shouldHideGenericSlotForLod', () => {
	it('hides ratio only below its threshold', () => {
		const opts = {
			...defaultGenericFootprintSeriesOptions,
			lodHideRatioMinSlotAreaPx: 100,
			lodHideNumberMinSlotAreaPx: 0,
		};
		const ratio = { role: 'ratio', metricId: 'delta', ratioDenominatorId: 'vol' } as const;
		assert.equal(shouldHideGenericSlotForLod(ratio, opts, 99), true);
		assert.equal(shouldHideGenericSlotForLod(ratio, opts, 100), false);
	});

	it('hides number only below its threshold', () => {
		const opts = {
			...defaultGenericFootprintSeriesOptions,
			lodHideRatioMinSlotAreaPx: 0,
			lodHideNumberMinSlotAreaPx: 80,
		};
		const number = { role: 'number', metricId: 'delta' } as const;
		assert.equal(shouldHideGenericSlotForLod(number, opts, 79), true);
		assert.equal(shouldHideGenericSlotForLod(number, opts, 80), false);
	});

	it('does not hide histogram or heatmap slots via Tier-2 guards', () => {
		const opts = {
			...defaultGenericFootprintSeriesOptions,
			lodHideRatioMinSlotAreaPx: 10_000,
			lodHideNumberMinSlotAreaPx: 10_000,
		};
		const hist = { role: 'histogram', metricId: 'vol', grow: 'left' } as const;
		const heat = { role: 'heatmapCell', metricId: 'vol' } as const;
		assert.equal(shouldHideGenericSlotForLod(hist, opts, 1), false);
		assert.equal(shouldHideGenericSlotForLod(heat, opts, 1), false);
	});
});

