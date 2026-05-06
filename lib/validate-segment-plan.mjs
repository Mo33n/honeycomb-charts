/**
 * Strict segment-plan guard before merging into LWC series options (RFC-0001).
 * @module honeycomb/lib/validate-segment-plan
 */
import { loadSegmentPlanFromJson } from './load-plan.mjs';
import { CompileLayoutError } from './errors.mjs';

/**
 * @param {unknown} plan
 * @param {string} engine expected `segmentPlan.engine` (e.g. `genericFootprint` | `footprint`)
 * @returns {Record<string, unknown>}
 */
export function validateSegmentPlan(plan, engine) {
	if (typeof engine !== 'string' || !engine.trim()) {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', 'validateSegmentPlan requires a non-empty engine string', {});
	}
	if (engine !== 'genericFootprint') {
		throw new CompileLayoutError('SEGMENT_PLAN_INVALID', 'only genericFootprint segment plans are supported', {});
	}
	return loadSegmentPlanFromJson(plan, { engine });
}
