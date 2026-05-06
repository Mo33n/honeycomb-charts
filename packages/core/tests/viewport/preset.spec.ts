import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveViewportSegmentProfilePreset } from '../../src/viewport/viewport-segment-profile-presets.js';

describe('resolveViewportSegmentProfilePreset', () => {
	it('default uses 22px nominal', () => {
		const r = resolveViewportSegmentProfilePreset('default');
		assert.equal(r.nominalPxPerBar, 22);
		assert.equal(r.densityClamp.min, 0.25);
	});

	it('dense uses lower nominal', () => {
		const r = resolveViewportSegmentProfilePreset('dense');
		assert.equal(r.nominalPxPerBar, 18);
	});
});
