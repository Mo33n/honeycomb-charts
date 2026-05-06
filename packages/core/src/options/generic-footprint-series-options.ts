import { customSeriesDefaultOptions, type CustomSeriesOptions } from 'lightweight-charts';

import {
	defaultGenericFootprintTheme,
	type GenericCellOverlay,
	type GenericFootprintSlot,
	type GenericFootprintTheme,
	validateGenericFootprintColumnOverlays,
	validateGenericFootprintSlots,
} from '../generic-footprint/model.js';

export type { GenericCellOverlay, GenericFootprintSlot, GenericFootprintTheme } from '../generic-footprint/model.js';
export {
	defaultGenericFootprintTheme,
	validateGenericFootprintColumnOverlays,
	validateGenericFootprintSlots,
} from '../generic-footprint/model.js';

/** One aggregated metric line above the footprint block (sum across levels). */
export interface GenericFootprintBarSummaryLine {
	readonly metricId: string;
	readonly colorBySign: boolean;
}

/** LWC custom series options for {@link GenericFootprintSeries}. */
export interface GenericFootprintStyleExtension {
	readonly slots: readonly GenericFootprintSlot[];
	readonly slotWeights: readonly number[];
	readonly theme: GenericFootprintTheme;
	/** Fraction [0, 0.35] of bar slot width reserved for mini OHLC strip. */
	readonly candleStripFraction: number;
	/** Optional candle-lane inner insets/gap (aliases from candle track spacing keys). */
	readonly candleInsetLeftCss?: number;
	readonly candleInsetRightCss?: number;
	readonly candleGapAfterCss?: number;
	/**
	 * Insert candle lane after this slot index (0..slots.length).
	 * Default: `slots.length` (candle lane at the right edge of slot area).
	 */
	readonly candleLaneIndex?: number;
	/** Horizontal price grid across the pane. */
	readonly showPriceGrid: boolean;
	readonly histogramShowValues: boolean;
	readonly pocMetricId?: string;
	/** Dynamic text floor in CSS px for zoom-reactive generic slot glyphs. */
	readonly minFontPx: number;
	/** Dynamic text ceiling in CSS px for zoom-reactive generic slot glyphs. */
	readonly maxFontPx: number;
	readonly minCellHeightPx: number;
	/** Lines drawn above the bar’s high (centered on the slot block). */
	readonly barHeaderLines?: readonly GenericFootprintBarSummaryLine[];
	/** Lines drawn below the bar’s low (e.g. total Δ then total vol). */
	readonly barFooterLines?: readonly GenericFootprintBarSummaryLine[];
	/** CSS px gap between OHLC extremes and the first summary line. */
	readonly barSummaryLabelGapCss: number;
	/** CSS px vertical pitch for bar summary text. */
	readonly barSummaryLineHeightCss: number;
	/**
	 * Tier-1 LOD guard for summary labels: when total slot area width is below this CSS px threshold,
	 * header/footer summary lines are omitted to reduce clutter.
	 */
	readonly lodSummaryMinSlotAreaPx: number;
	/**
	 * Tier-2 LOD guard for ratio slots: when total slot area width is below this CSS px threshold,
	 * slots with `role: "ratio"` are skipped (no glyph draw / no hit target).
	 */
	readonly lodHideRatioMinSlotAreaPx: number;
	/**
	 * Tier-2 LOD guard for number slots: when total slot area width is below this CSS px threshold,
	 * slots with `role: "number"` are skipped (after/independent of ratio suppression).
	 */
	readonly lodHideNumberMinSlotAreaPx: number;
	/**
	 * Compiler-emitted segment-plan revision (FNV digest of layout id + engine). Renderers fold this into
	 * layout signatures so skip-cache invalidates on `swapLayout` (CT-P1-13).
	 */
	readonly honeycombLayoutRevision?: number;
	/**
	 * Per-column overlay stacks (same cardinality as `slots`). From honeycomb segment plan v2 / adapter.
	 */
	readonly columnOverlays?: readonly (readonly GenericCellOverlay[])[];
	/** When false, the mini OHLC strip is omitted (P2-B lane visibility). Default true. */
	readonly candleLaneVisible: boolean;
}

export type GenericFootprintSeriesOptions = CustomSeriesOptions & GenericFootprintStyleExtension;

const defaultSlots: readonly GenericFootprintSlot[] = [
	{ role: 'histogram', metricId: 'vol', grow: 'left', histogramColor: 'rgba(144, 202, 249, 0.58)' },
	{ role: 'ratio', metricId: 'delta', ratioDenominatorId: 'vol' },
	{ role: 'histogram', metricId: 'delta', grow: 'right', histogramColor: 'rgba(255, 183, 77, 0.58)' },
];

export const genericFootprintStyleDefaults: GenericFootprintStyleExtension = {
	slots: defaultSlots,
	slotWeights: [1.15, 1, 1.15],
	theme: defaultGenericFootprintTheme,
	candleStripFraction: 0.12,
	showPriceGrid: true,
	histogramShowValues: true,
	minFontPx: 11,
	maxFontPx: 11,
	minCellHeightPx: 3,
	barSummaryLabelGapCss: 4,
	barSummaryLineHeightCss: 12,
	lodSummaryMinSlotAreaPx: 0,
	lodHideRatioMinSlotAreaPx: 0,
	lodHideNumberMinSlotAreaPx: 0,
	candleLaneVisible: true,
};

export const defaultGenericFootprintSeriesOptions: GenericFootprintSeriesOptions = {
	...customSeriesDefaultOptions,
	...genericFootprintStyleDefaults,
};

validateGenericFootprintSlots(
	defaultGenericFootprintSeriesOptions.slots,
	defaultGenericFootprintSeriesOptions.slotWeights
);

export function mergeGenericFootprintSeriesOptions(
	base: GenericFootprintSeriesOptions,
	partial: Partial<GenericFootprintSeriesOptions>
): GenericFootprintSeriesOptions {
	const merged: GenericFootprintSeriesOptions = {
		...base,
		...partial,
		...(partial.theme !== undefined ? { theme: { ...base.theme, ...partial.theme } } : {}),
	};
	validateGenericFootprintSlots(merged.slots, merged.slotWeights);
	validateGenericFootprintColumnOverlays(merged.slots, merged.columnOverlays);
	return merged;
}
