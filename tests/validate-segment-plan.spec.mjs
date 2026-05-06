import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RENDER_PLAN_VERSION } from '../lib/compiler-core.mjs';
import { CompileLayoutError } from '../lib/errors.mjs';
import { validateSegmentPlan } from '../lib/validate-segment-plan.mjs';

describe('validateSegmentPlan', () => {
	it('returns plan when engine matches', () => {
		const plan = {
			renderPlanVersion: RENDER_PLAN_VERSION,
			layoutId: 'z',
			engine: 'genericFootprint',
		};
		assert.strictEqual(validateSegmentPlan(plan, 'genericFootprint'), plan);
	});

	it('requires non-empty engine argument', () => {
		assert.throws(
			() =>
				validateSegmentPlan({ renderPlanVersion: RENDER_PLAN_VERSION, layoutId: 'z', engine: 'genericFootprint' }, ''),
			e => e instanceof CompileLayoutError && e.code === 'SEGMENT_PLAN_INVALID'
		);
	});

	it('throws on engine mismatch', () => {
		assert.throws(
			() =>
				validateSegmentPlan(
					{ renderPlanVersion: RENDER_PLAN_VERSION, layoutId: 'z', engine: 'genericFootprint' },
					'footprint'
				),
			e => e instanceof CompileLayoutError && e.code === 'SEGMENT_PLAN_INVALID'
		);
	});
});
