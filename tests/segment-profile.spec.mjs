import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveSegmentProfileLayoutId } from '../lib/segment-profile.mjs';

describe('resolveSegmentProfileLayoutId', () => {
	const selector = {
		hysteresisPx: 10,
		rules: [
			{ minWidthPx: 0, layoutId: 'narrow' },
			{ minWidthPx: 800, layoutId: 'wide' },
		],
	};

	it('commits wide only after crossing boundary with hysteresis when growing', () => {
		let state = { lastCommittedLayoutId: null, lastWidthPx: null };
		state = resolveSegmentProfileLayoutId(400, selector, state);
		assert.equal(state.layoutId, 'narrow');
		state = resolveSegmentProfileLayoutId(790, selector, state);
		assert.equal(state.layoutId, 'narrow');
		state = resolveSegmentProfileLayoutId(815, selector, state);
		assert.equal(state.layoutId, 'wide');
	});

	it('stays wide until shrinking past boundary minus hysteresis', () => {
		let state = { lastCommittedLayoutId: 'wide', lastWidthPx: 900 };
		state = resolveSegmentProfileLayoutId(805, selector, state);
		assert.equal(state.layoutId, 'wide');
		state = resolveSegmentProfileLayoutId(785, selector, state);
		assert.equal(state.layoutId, 'narrow');
	});
});
