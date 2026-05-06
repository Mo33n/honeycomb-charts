import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { segmentProfileSelectorWidth } from '../../src/viewport/segment-profile-selector-width.js';

describe('segmentProfileSelectorWidth', () => {
	it('combines zoom signal with complexity ratio', () => {
		const r = segmentProfileSelectorWidth({
			zoomEffectiveWidthPx: 800,
			referenceComplexity: 2,
			layoutComplexity: 2,
			chartWidthPx: 1200,
			visibleLogicalSpan: 100,
			detailTierMinWidthPx: 620,
			nominalPxPerBar: 22,
		});
		assert.equal(r.uncappedProfileWidthCss, 800);
		assert.ok(r.selectorWidthCss <= r.uncappedProfileWidthCss);
	});

	it('caps by per-bar when bars are narrow', () => {
		const r = segmentProfileSelectorWidth({
			zoomEffectiveWidthPx: 1100,
			referenceComplexity: 1.35,
			layoutComplexity: 1.35,
			chartWidthPx: 2400,
			visibleLogicalSpan: 150,
			detailTierMinWidthPx: 620,
			nominalPxPerBar: 22,
		});
		assert.ok(r.selectorWidthCss < r.uncappedProfileWidthCss);
		assert.ok(r.perBarPx !== null && r.perBarPx > 0);
	});
});
