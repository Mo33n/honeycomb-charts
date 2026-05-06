/** Mutable baseline for zoom-density mapping (first stable visible span). */
export type ZoomBaselineState = {
	baselineVisibleSpan: number | null;
};

export type DensityClamp = {
	min: number;
	max: number;
};

const DEFAULT_DENSITY_CLAMP: DensityClamp = { min: 0.25, max: 4 };

/**
 * Maps container width + visible logical span → pseudo-width for segment profile breakpoints.
 * Zoom out (larger span) → smaller factor → smaller effective width.
 */
export function zoomEffectiveWidthPx(
	containerWidthPx: number,
	visibleLogicalSpan: number | null,
	state: ZoomBaselineState,
	clamp: DensityClamp = DEFAULT_DENSITY_CLAMP
): number {
	const widthCss = Math.max(1, containerWidthPx);
	if (visibleLogicalSpan === null) {
		return widthCss;
	}
	if (state.baselineVisibleSpan === null) {
		state.baselineVisibleSpan = visibleLogicalSpan;
		return widthCss;
	}
	const densityFactor = Math.min(clamp.max, Math.max(clamp.min, state.baselineVisibleSpan / visibleLogicalSpan));
	return Math.max(1, widthCss * densityFactor);
}
