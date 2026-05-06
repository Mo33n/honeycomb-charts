/**
 * Maps a compiled **genericFootprint** `segmentPlan` → merge partial for `mergeGenericFootprintSeriesOptions`.
 * @module honeycomb/lib/adapter-generic
 */
import { CompileLayoutError } from './errors.mjs';
import { validateSegmentPlan } from './validate-segment-plan.mjs';

/**
 * @param {unknown} plan
 * @param {{ theme?: Record<string, unknown> | null }} [options] resolved catalog theme for `themeRef` (compiler inlines it here)
 * @returns {Record<string, unknown>} partial compatible with honeycomb-charts `mergeGenericFootprintSeriesOptions`
 */
export function mapSegmentPlanToGenericPartial(plan, options = {}) {
	const p = validateSegmentPlan(plan, 'genericFootprint');
	const layoutId = typeof p.layoutId === 'string' ? p.layoutId : '';
	const layoutRev = p.layoutRevision;

	if (!Array.isArray(p.columns)) {
		throw new CompileLayoutError('ADAPTER_INVALID_SEGMENT_PLAN', 'segmentPlan.columns must be an array', {
			layoutId,
		});
	}

	const cols = [...p.columns].sort((a, b) => {
		const ao = a && typeof a === 'object' && typeof a.order === 'number' ? a.order : 0;
		const bo = b && typeof b === 'object' && typeof b.order === 'number' ? b.order : 0;
		return ao - bo;
	});

	const slots = [];
	const slotWeights = [];
	const columnOverlays = [];
	for (let i = 0; i < cols.length; i++) {
		const c = cols[i];
		if (!c || typeof c !== 'object' || c.lwcGenericFootprintSlot === undefined || c.lwcGenericFootprintSlot === null) {
			throw new CompileLayoutError(
				'ADAPTER_INVALID_SEGMENT_PLAN',
				`columns[${String(i)}].lwcGenericFootprintSlot is required`,
				{ layoutId }
			);
		}
		slots.push(c.lwcGenericFootprintSlot);
		slotWeights.push(typeof c.weight === 'number' ? c.weight : 1);
		const ovs = c.overlays;
		columnOverlays.push(Array.isArray(ovs) ? ovs : []);
	}

	/** @type {Record<string, unknown>} */
	const out = {
		slots,
		slotWeights,
	};
	if (columnOverlays.some(a => a.length > 0)) {
		out.columnOverlays = columnOverlays;
	}

	const chrome = p.chrome && typeof p.chrome === 'object' && !Array.isArray(p.chrome) ? p.chrome : {};
	const candleThemeKeys = new Set([
		'candleLaneBg',
		'candleLaneEdge',
		'candleWick',
		'candleBull',
		'candleBear',
		'candleBullStroke',
		'candleBearStroke',
	]);
	/** @type {Record<string, unknown>} */
	const candleThemePatch = {};
	for (const [k, v] of Object.entries(chrome)) {
		if (candleThemeKeys.has(k)) {
			candleThemePatch[k] = v;
			continue;
		}
		out[k] = v;
	}

	const summaries = p.summaries && typeof p.summaries === 'object' && !Array.isArray(p.summaries) ? p.summaries : {};
	if (summaries.header !== undefined) {
		out.barHeaderLines = summaries.header;
	}
	if (summaries.footer !== undefined) {
		out.barFooterLines = summaries.footer;
	}

	const poc = p.poc;
	if (poc && typeof poc === 'object' && poc.metricId !== undefined) {
		out.pocMetricId = poc.metricId;
	}

	const typo = p.typography && typeof p.typography === 'object' && !Array.isArray(p.typography) ? p.typography : {};
	if (typo.minFontPx !== undefined) {
		out.minFontPx = typo.minFontPx;
	}
	if (typo.maxFontPx !== undefined) {
		out.maxFontPx = typo.maxFontPx;
	}
	if (typo.minCellHeightPx !== undefined) {
		out.minCellHeightPx = typo.minCellHeightPx;
	}

	const spacing = p.spacing && typeof p.spacing === 'object' && !Array.isArray(p.spacing) ? p.spacing : {};
	if (spacing.barSummaryLabelGapCss !== undefined) {
		out.barSummaryLabelGapCss = spacing.barSummaryLabelGapCss;
	}
	if (spacing.barSummaryLineHeightCss !== undefined) {
		out.barSummaryLineHeightCss = spacing.barSummaryLineHeightCss;
	}

	const theme = options.theme;
	const baseTheme =
		theme !== undefined && theme !== null && typeof theme === 'object' && !Array.isArray(theme) ? theme : {};
	const mergedTheme = { ...baseTheme, ...candleThemePatch };
	if (Object.keys(mergedTheme).length > 0) {
		out.theme = mergedTheme;
	}

	if (
		typeof layoutRev === 'number' &&
		Number.isInteger(layoutRev) &&
		layoutRev >= 0 &&
		layoutRev <= 0xffffffff
	) {
		out.honeycombLayoutRevision = layoutRev;
	}

	return out;
}
