/**
 * Pure mapping from viewport facts → CSS px for `createHoneycombChartBinding().onViewportWidthCss`.
 *
 * Multiple independent “pressure” signals are combined with {@link Math.min} — the tightest constraint wins.
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
	 * First positive `minWidthPx` from the segment profile rule list (same units as `onViewportWidthCss`).
	 */
	detailTierMinWidthPx: number;
	/** Logical px/bar at which per-bar synthetic width equals `detailTierMinWidthPx`. */
	nominalPxPerBar: number;
};

export type SegmentProfileSelectorWidthResult = {
	selectorWidthCss: number;
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

	const nominalPxPerBar = Math.max(1, input.nominalPxPerBar);
	const perBarScale = input.detailTierMinWidthPx / nominalPxPerBar;
	const fromPerBar = perBarPx !== null ? perBarPx * perBarScale : uncapped;

	return {
		selectorWidthCss: Math.min(uncapped, fromPerBar),
		uncappedProfileWidthCss: uncapped,
		perBarPx,
	};
}
