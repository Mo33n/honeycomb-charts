import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseFootprintPresetV1, presetToPartialOptions } from '../src/preset/footprint-preset-v1.js';
import {
	footprintCellRawFontPxFromHeight,
	shouldDrawFootprintNumberGlyph,
} from '../src/render/lod-number-glyph.js';

describe('LOD number glyph policy (HC1-030)', () => {
	const min = 10;
	const max = 13;

	it('when LOD off, always draw regardless of cell height', () => {
		assert.equal(shouldDrawFootprintNumberGlyph(4, min, max, false), true);
		assert.equal(shouldDrawFootprintNumberGlyph(100, min, max, false), true);
	});

	it('just below min floor: raw 9 < 10 → omit when LOD on', () => {
		const cellH = 13;
		assert.equal(footprintCellRawFontPxFromHeight(cellH), 9);
		assert.equal(shouldDrawFootprintNumberGlyph(cellH, min, max, true), false);
	});

	it('at min floor: raw 10 >= 10 → draw when LOD on', () => {
		const cellH = 14;
		assert.equal(footprintCellRawFontPxFromHeight(cellH), 10);
		assert.equal(shouldDrawFootprintNumberGlyph(cellH, min, max, true), true);
	});

	it('above min floor: draw when LOD on', () => {
		const cellH = 24;
		assert.equal(footprintCellRawFontPxFromHeight(cellH), 18);
		assert.equal(shouldDrawFootprintNumberGlyph(cellH, min, max, true), true);
	});

	it('FootprintPresetV1 round-trips lodOmitNumberGlyphs', () => {
		const preset = parseFootprintPresetV1({ version: 1, lodOmitNumberGlyphs: true });
		assert.equal(preset.lodOmitNumberGlyphs, true);
		assert.equal(presetToPartialOptions(preset).lodOmitNumberGlyphs, true);
	});
});
