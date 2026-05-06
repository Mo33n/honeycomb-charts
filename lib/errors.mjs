/**
 * Typed errors for the layout catalog compiler and segment-plan runtime guards (RFC-0001 §4.2).
 * @module honeycomb/lib/errors
 */

/**
 * @typedef {'CATALOG_INVALID' | 'LAYOUT_ID_INVALID' | 'LAYOUT_DUPLICATE' | 'LAYOUT_NOT_FOUND' | 'TEMPLATE_REF_UNKNOWN' | 'BINDING_METRIC_MISMATCH' | 'BINDING_DENOMINATOR_MISMATCH' | 'TRACK_BINDING_MISSING' | 'RATIO_DENOMINATOR_MISSING' | 'BINDING_SCOPE_INVALID' | 'TRACK_ROLE_UNKNOWN' | 'UNKNOWN_GENERIC_ROLE' | 'UNKNOWN_FOOTPRINT_KIND' | 'HISTOGRAM_GROW_INVALID' | 'FOOTPRINT_SIDE_INVALID' | 'FOOTPRINT_COLUMN_BINDING' | 'NUMBER_HISTOGRAM_STYLE' | 'TRACK_WEIGHT_MISMATCH' | 'TRACKS_EMPTY' | 'ENGINE_UNKNOWN' | 'SEGMENT_PLAN_INVALID' | 'RENDER_PLAN_MAJOR_UNSUPPORTED' | 'SEGMENT_PLAN_ENGINE_MISMATCH' | 'SEGMENT_PLAN_FETCH_FAILED' | 'SEGMENT_PLAN_TOO_LARGE' | 'SEGMENT_PLAN_ORIGIN_FORBIDDEN' | 'SEGMENT_PLAN_NON_JSON' | 'ADAPTER_INVALID_SEGMENT_PLAN' | 'DATA_MAPPING_INVALID' | 'CHART_BINDING_INVALID' | 'MUTATION_BAR_NOT_FOUND' | 'PATH_REJECTED' | 'PATH_TOO_DEEP' | 'PATH_TOO_LONG' | 'PATH_INVALID_SEGMENT' | 'PATH_INVALID_INDEX' | 'PATH_NOT_FOUND' | 'MUTATION_INVALID_VALUE'} CompileLayoutErrorCode
 */

export class CompileLayoutError extends Error {
	/**
	 * @param {string} code
	 * @param {string} message
	 * @param {{ layoutId?: string; columnIndex?: number; trackIndex?: number }} [details]
	 */
	constructor(code, message, details = {}) {
		super(message);
		this.name = 'CompileLayoutError';
		/** @type {string} */
		this.code = code;
		this.layoutId = details.layoutId;
		this.columnIndex = details.columnIndex;
		this.trackIndex = details.trackIndex;
	}
}
