/**
 * HC2-040: `canonicalFootprintPresetV1Json` + parse strip unknown keys (documented as `canonicalFootprintPresetV1Json` in `docs/presets-v1.2.md`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { defaultHoneycombSeriesOptions, mergeHoneycombSeriesOptions } from '../src/options/footprint-series-options.js';
import {
	canonicalFootprintPresetV1Json,
	parseFootprintPresetV1,
	presetToPartialOptions,
} from '../src/preset/footprint-preset-v1.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'test', 'fixtures');

describe('FootprintPresetV1 v1.2 round-trip (HC2-040)', () => {
	it('strips unknown root keys; canonical matches clean preset', () => {
		const raw = JSON.parse(readFileSync(join(fixturesDir, 'preset-unknown-root-keys.json'), 'utf8')) as unknown;
		const preset = parseFootprintPresetV1(raw);
		const stripped = parseFootprintPresetV1(
			JSON.parse(JSON.stringify({ version: 1, left: { columns: [{ metricId: 'bid', kind: 'number', visible: true }] } }))
		);
		assert.equal(canonicalFootprintPresetV1Json(preset), canonicalFootprintPresetV1Json(stripped));
	});

	it('parses preset column static style (numberHistogram) and round-trips canonical JSON', () => {
		const preset = parseFootprintPresetV1({
			version: 1,
			left: {
				columns: [
					{
						metricId: 'bid',
						kind: 'number',
						visible: true,
						style: {
							numberHistogram: { sourceMetricId: 'bid', direction: 'left', color: 'rgba(9,9,9,0.4)' },
						},
					},
				],
			},
		});
		const h = preset.left?.columns[0]?.style?.numberHistogram;
		assert.equal(h?.sourceMetricId, 'bid');
		assert.equal(h?.direction, 'left');
		const again = parseFootprintPresetV1(JSON.parse(canonicalFootprintPresetV1Json(preset)));
		assert.equal(canonicalFootprintPresetV1Json(again), canonicalFootprintPresetV1Json(preset));
	});

	it('frozen rule-colors fixture round-trips through partial merge', () => {
		const raw = JSON.parse(readFileSync(join(fixturesDir, 'rule-colors-delta-column.json'), 'utf8')) as unknown;
		const preset = parseFootprintPresetV1(raw);
		const merged = mergeHoneycombSeriesOptions(defaultHoneycombSeriesOptions, presetToPartialOptions(preset));
		assert.equal(merged.right?.columns?.[0]?.metricId, 'delta');
		const again = parseFootprintPresetV1(JSON.parse(canonicalFootprintPresetV1Json(preset)));
		assert.equal(canonicalFootprintPresetV1Json(again), canonicalFootprintPresetV1Json(preset));
	});
});
