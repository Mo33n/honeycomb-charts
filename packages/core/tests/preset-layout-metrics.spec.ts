import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	parseFootprintPresetV1,
	presetToPartialOptions,
} from '../src/preset/footprint-preset-v1.js';

describe('preset layout metrics (T-060)', () => {
	it('canonical partial options from preset are stable', () => {
		const preset = parseFootprintPresetV1({
			version: 1,
			left: {
				columns: [
					{ metricId: 'a', kind: 'number', visible: true, weight: 2 },
					{ metricId: 'b', kind: 'bar', visible: false, weight: 1 },
				],
			},
			candleZOrder: 'outlineFront',
		});
		const partial = presetToPartialOptions(preset);
		assert.equal(partial.candleZOrder, 'outlineFront');
		assert.equal(partial.left?.columns[0]?.metricId, 'a');
		assert.equal(partial.left?.columns[0]?.weight, 2);
		assert.equal(partial.left?.columns[1]?.visible, false);
	});
});
