/**
 * Pure mapping from viewport facts → CSS px for `createHoneycombChartBinding().onViewportWidthCss`.
 *
 * Contract: multiple independent “pressure” signals are combined with {@link Math.min} — the tightest
 * constraint wins. Callers supply scalars; catalog/layout specifics live outside this module.
 */

export type SegmentProfileSelectorWidthInput = {
	/** Zoom/density width in px (e.g. clientWidth × baseline-relative factor). */
	zoomEffectiveWidthPx: number;
	/** Neutral complexity for breakpoint calibration (e.g. median Σ trackWeights across profile targets). */
	referenceComplexity: number;
	/** Current layout complexity (e.g. Σ `segment.trackWeights`); must be ≥ 1. */
	layoutComplexity: number;
	/** Chart width in CSS px. */
	chartWidthPx: number;
	/** `timeScale.getVisibleLogicalRange()` span, or null if unknown. */
	visibleLogicalSpan: number | null;
	/**
	 * First positive `minWidthPx` from the segment profile’s rule list (same units as `onViewportWidthCss`).
	 * Aligns per-bar synthetic width to that breakpoint — **no layout id required**, only rule thresholds.
	 */
	detailTierMinWidthPx: number;
	/** Logical px/bar at which per-bar synthetic width equals `detailTierMinWidthPx`. */
	nominalPxPerBar: number;
};

export type SegmentProfileSelectorWidthResult = {
	/** Value passed to `onViewportWidthCss`. */
	selectorWidthCss: number;
	/** Before per-bar `min`; useful for diagnostics. */
	uncappedProfileWidthCss: number;
	perBarPx: number | null;
};

export function segmentProfileSelectorWidth(input: SegmentProfileSelectorWidthInput): SegmentProfileSelectorWidthResult {
	const collective = Math.max(1, input.layoutComplexity);
	const ref = Math.max(1, input.referenceComplexity);
	const uncapped = Math.max(1, input.zoomEffectiveWidthPx * (ref / collective));

	const span = input.visibleLogicalSpan;
	const perBarPx =
		span !== null && span > 0 && Number.isFinite(span) ? input.chartWidthPx / span : null;

	const perBarScale = input.detailTierMinWidthPx / input.nominalPxPerBar;
	const fromPerBar = perBarPx !== null ? perBarPx * perBarScale : uncapped;

	return {
		selectorWidthCss: Math.min(uncapped, fromPerBar),
		uncappedProfileWidthCss: uncapped,
		perBarPx,
	};
}
