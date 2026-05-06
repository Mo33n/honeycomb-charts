/**
 * Generic footprint **data + view config** for pure-canvas rendering.
 * Host apps build {@link FootprintGenericViewModel} (or JSON → parser you add later).
 */

/** One traded price row within a bar. */
export interface FootprintLevelRow {
	readonly price: number;
	/** Arbitrary numeric metrics (bid, ask, vol, delta, …). */
	readonly values: Readonly<Record<string, number>>;
}

export interface FootprintBar {
	readonly open: number;
	readonly high: number;
	readonly low: number;
	readonly close: number;
	readonly levels: readonly FootprintLevelRow[];
	/** Optional banner above the column (e.g. bar delta). */
	readonly header?: FootprintBarHeaderAnnotation;
	/** Optional strip under the column (e.g. volume summary). */
	readonly footer?: FootprintBarFooterAnnotation;
}

export interface FootprintBarHeaderAnnotation {
	readonly text: string;
	readonly color?: string;
}

export interface FootprintBarFooterAnnotation {
	readonly left: string;
	readonly right: string;
	readonly leftColor?: string;
	readonly rightColor?: string;
}

/**
 * One visual slot in the row template, left → right.
 * - **histogram**: horizontal bar for `metricId`, anchored by `grow` (left, right, or center).
 * - **number**: single numeric glyph for `metricId`.
 * - **ratio**: text `metricId / ratioDenominatorId` (e.g. delta / volume).
 */
export type FootprintSlotDef =
	| {
		readonly role: 'histogram';
		readonly metricId: string;
		readonly grow: 'left' | 'right' | 'center';
		readonly histogramColor?: string;
	}
	| {
		readonly role: 'number';
		readonly metricId: string;
	}
	| {
		readonly role: 'ratio';
		readonly metricId: string;
		readonly ratioDenominatorId: string;
	};

export interface FootprintTheme {
	readonly background: string;
	readonly gridColor: string;
	readonly gridDash: readonly number[];
	readonly cellSeparator: string;
	readonly numberFont: string;
	readonly headerFont: string;
	readonly footerFont: string;
	readonly textPrimary: string;
	readonly textOnDark: string;
	readonly histogramLeft: string;
	readonly histogramRight: string;
	readonly candleLaneBg: string;
	readonly candleLaneEdge: string;
	readonly candleWick: string;
	readonly candleBull: string;
	readonly candleBear: string;
	readonly candleBullStroke: string;
	readonly candleBearStroke: string;
	readonly pocBorder: string;
	/** Font for values drawn on histogram bars; defaults to {@link FootprintTheme.numberFont}. */
	readonly histogramValueFont?: string;
	/** Fill for histogram value text; defaults to near-white. */
	readonly histogramValueColor?: string;
	/** Stroke around histogram glyphs for contrast on colored bars. */
	readonly histogramValueOutline?: string;
}

export interface FootprintGenericViewModel {
	readonly bars: readonly FootprintBar[];
	/** Left-to-right slot pipeline applied at every price row. */
	readonly slots: readonly FootprintSlotDef[];
	/** Same length as `slots`; only relative ratios matter. */
	readonly slotWeights: readonly number[];
	readonly theme: FootprintTheme;
	/** Fraction [0, 0.35] of bar width for mini OHLC strip. */
	readonly candleStripFraction: number;
	readonly headerBandHeight: number;
	readonly footerBandHeight: number;
	readonly padding: FootprintPadding;
	readonly gapBetweenBars: number;
	/**
	 * When set, POC row = argmax `|values[pocMetricId]|` (e.g. **`vol`**).
	 * When omitted, POC uses summed activity across slots (legacy).
	 */
	readonly pocMetricId?: string;
	/** When not **`false`**, draw the numeric **value on each histogram** slot (default: on). */
	readonly histogramShowValues?: boolean;
}

export interface FootprintPadding {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

/** Per-bar horizontal geometry (computed). */
export interface FootprintBarGeometry {
	readonly index: number;
	readonly x: number;
	readonly width: number;
	readonly slotXs: readonly number[];
	readonly slotWidths: readonly number[];
	readonly candleX: number;
	readonly candleW: number;
}

/** Price → Y mapping for the chart body. */
export interface FootprintPriceProjection {
	readonly top: number;
	readonly height: number;
	readonly pMin: number;
	readonly pMax: number;
}

export interface FootprintLayout {
	readonly innerX: number;
	readonly innerY: number;
	readonly innerW: number;
	readonly innerH: number;
	readonly chartTop: number;
	readonly chartHeight: number;
	readonly price: FootprintPriceProjection;
	readonly barGeometries: readonly FootprintBarGeometry[];
}
