import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	maxAbsMetricInBar,
	maxAbsBarMetricsVisibleWindow,
	normalizedBarValue,
} from '../src/render/bar-metric-scale.js';

describe('bar metric scale (T-032 perBar)', () => {
	it('scales within bar using max abs for that metric only', () => {
		const levels = [
			{ price: 1, values: { d: 10, x: 99 } },
			{ price: 2, values: { d: -5, x: 1 } },
		];
		assert.equal(maxAbsMetricInBar(levels, 'd'), 10);
		const t = normalizedBarValue(5, 'd', 'perBar', levels, null);
		assert.equal(t, 0.5);
	});
});

describe('bar metric scale (T-032 perVisibleWindow)', () => {
	it('uses window max across visible bars', () => {
		const win = maxAbsBarMetricsVisibleWindow(
			[
				[{ price: 1, values: { d: 20 } }],
				[{ price: 1, values: { d: -40 } }],
			],
			new Set(['d'])
		);
		const t = normalizedBarValue(-20, 'd', 'perVisibleWindow', [{ price: 1, values: { d: -20 } }], win);
		assert.equal(t, -0.5);
	});
});
