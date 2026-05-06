import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	parseFootprintPresetV1,
	defaultOptionsWithPreset,
	FOOTPRINT_PRESET_VERSION,
} from '../src/preset/footprint-preset-v1.js';

describe('FootprintPresetV1', () => {
	it('round-trips valid fixture', () => {
		const raw = {
			version: FOOTPRINT_PRESET_VERSION,
			layoutDirection: 'ltr',
			left: { columns: [{ metricId: 'bid', kind: 'number', visible: true, weight: 2 }] },
			right: { columns: [{ metricId: 'delta', kind: 'bar', visible: true }] },
			minFontPx: 9,
		};
		const preset = parseFootprintPresetV1(raw);
		const opts = defaultOptionsWithPreset(preset);
		assert.equal(opts.left.columns[0]!.weight, 2);
		assert.equal(opts.minFontPx, 9);
	});

	it('rejects wrong version', () => {
		assert.throws(() => parseFootprintPresetV1({ version: 99 }));
	});
});
