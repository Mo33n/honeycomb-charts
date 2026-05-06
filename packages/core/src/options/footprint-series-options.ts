import { customSeriesDefaultOptions, type CustomSeriesOptions } from 'lightweight-charts';

import type { FootprintLayoutDirection } from '../layout/layout-direction.js';
import type { GenericCellOverlay } from '../generic-footprint/model.js';
import type { FootprintColumnColorRule } from '../rules/column-color-rules.js';

export type { FootprintLayoutDirection } from '../layout/layout-direction.js';

export type FootprintColumnKind = 'number' | 'bar';

/**
 * Horizontal volume strip drawn **inside** a **`number`** column cell (reference-style bid/ask histogram).
 * Length is `|sourceMetricId| / max(|same metric|)` across all price rows in the bar.
 */
export interface FootprintNumberHistogramStyle {
	readonly sourceMetricId: string;
	readonly direction: 'left' | 'right';
	/** Fill color (may include alpha), e.g. `rgba(239,83,80,0.45)`. */
	readonly color: string;
}

/** Optional cell frame (e.g. “highlight” box on hot prices). */
export interface FootprintCellOutlineStyle {
	readonly color: string;
	/** CSS px; scaled by renderer to bitmap coordinates. */
	readonly widthPx: number;
}

export interface FootprintColumnStyle {
	readonly textColor?: string;
	readonly barPositiveColor?: string;
	readonly barNegativeColor?: string;
	/** When set on a **`number`** column, draws a bar behind the glyph (still uses `metricId` for the text). */
	readonly numberHistogram?: FootprintNumberHistogramStyle;
	readonly cellOutline?: FootprintCellOutlineStyle;
}

export interface FootprintColumnDef {
	readonly metricId: string;
	readonly kind: FootprintColumnKind;
	readonly visible: boolean;
	readonly weight?: number;
	readonly placeholder?: string;
	readonly style?: FootprintColumnStyle;
	/** Declarative color overlays (v1.1 / RFC D3). See `docs/rule-colors-v1.1.md`. */
	readonly colorRules?: readonly FootprintColumnColorRule[];
	/** ADR-0005 cell overlays (`cellBand` v1). Compiler `overlays[]` → preset `cellOverlays`. */
	readonly cellOverlays?: readonly GenericCellOverlay[];
}

export interface FootprintSegmentSide {
	readonly columns: readonly FootprintColumnDef[];
}

export type FilteredBarTimeAxisPolicy = 'compress' | 'retainGap';

export type BarMetricScope = 'perBar' | 'perVisibleWindow';
export type FootprintBarAlignMode =
	| 'positiveLeftNegativeRight'
	| 'positiveRightNegativeLeft'
	| 'centered'
	| 'leftOnly'
	| 'rightOnly';

/**
 * One-shot visual feedback when **`revision`** strictly increases on a bar (PRD FR-27 / v1.2).
 * See `docs/correction-flash-v1.2.md`.
 */
export type CorrectionFlashMode = 'off' | 'subtle';

export interface FootprintCandleStyle {
	readonly wickColor: string;
	readonly bullWickColor?: string;
	readonly bearWickColor?: string;
	readonly bullBodyFill: string;
	readonly bearBodyFill: string;
	readonly bullBodyBorder: string;
	readonly bearBodyBorder: string;
}

export interface FootprintRevisionEvent<HorzScaleItem = unknown> {
	readonly time: HorzScaleItem;
	readonly revision: number;
	readonly previousRevision?: number;
}

/** Honeycomb-series specific options merged into custom series options (RFC §5.3). */
export interface HoneycombStyleExtension {
	readonly layoutDirection: FootprintLayoutDirection;
	readonly left: FootprintSegmentSide;
	readonly right: FootprintSegmentSide;
	readonly bodyVisible: boolean;
	readonly wicksVisible: boolean;
	readonly candleZOrder: 'behind' | 'outlineFront';
	readonly filteredBarTimeAxis: FilteredBarTimeAxisPolicy;
	readonly minFontPx: number;
	readonly maxFontPx: number;
	readonly minCellHeightPx: number;
	readonly columnMinPx: number;
	readonly columnMaxPx: number;
	readonly barMetricScope: BarMetricScope;
	/** Placement of `kind: "bar"` cells for positive/negative values. */
	readonly barAlignMode: FootprintBarAlignMode;
	/**
	 * When **true**, number-column text is skipped for cells whose raw font height would stay
	 * **below** `minFontPx` (see `shouldDrawFootprintNumberGlyph`). Bar columns and hit targets
	 * unchanged. Default **false** (MVP). See `docs/lod-v1.1.md`.
	 */
	readonly lodOmitNumberGlyphs: boolean;
	/**
	 * **`subtle`**: ≤**300ms** fade highlight over the footprint **column footprint** (L+R slots, all price rows).
	 * Respects **`prefers-reduced-motion: reduce`** (no flash). Default **`off`**.
	 */
	readonly correctionFlash: CorrectionFlashMode;
	/** Candlestick chrome colors (wick + body fill/border by direction). */
	readonly candleStyle: FootprintCandleStyle;
	readonly onRevision?: (event: FootprintRevisionEvent<unknown>) => void;
	/**
	 * Compiler segment-plan revision; folded into footprint renderer spacing digest (CT-P1-13).
	 */
	readonly honeycombLayoutRevision?: number;
}

export type HoneycombSeriesOptions = CustomSeriesOptions & HoneycombStyleExtension;

const defaultLeft: FootprintSegmentSide = {
	columns: [
		{ metricId: 'bid', kind: 'number', visible: true, weight: 1 },
		{ metricId: 'ask', kind: 'number', visible: true, weight: 1 },
	],
} as const;

const defaultRight: FootprintSegmentSide = {
	columns: [
		{ metricId: 'delta', kind: 'bar', visible: true, weight: 1 },
	],
} as const;

export const honeycombStyleDefaults: HoneycombStyleExtension = {
	layoutDirection: 'ltr',
	left: defaultLeft,
	right: defaultRight,
	bodyVisible: true,
	wicksVisible: true,
	candleZOrder: 'behind',
	filteredBarTimeAxis: 'compress',
	minFontPx: 8,
	maxFontPx: 13,
	minCellHeightPx: 4,
	columnMinPx: 2,
	columnMaxPx: 512,
	barMetricScope: 'perBar',
	barAlignMode: 'positiveLeftNegativeRight',
	lodOmitNumberGlyphs: false,
	correctionFlash: 'off',
	candleStyle: {
		wickColor: '#c8cbd2',
		bullBodyFill: 'rgba(38,166,154,0.25)',
		bearBodyFill: 'rgba(239,83,80,0.25)',
		bullBodyBorder: '#26a69a',
		bearBodyBorder: '#ef5350',
	},
};

export const defaultHoneycombSeriesOptions: HoneycombSeriesOptions = {
	...customSeriesDefaultOptions,
	...honeycombStyleDefaults,
};

export function mergeHoneycombSeriesOptions(
	base: HoneycombSeriesOptions,
	partial: Partial<HoneycombSeriesOptions>
): HoneycombSeriesOptions {
	return {
		...base,
		...partial,
		...(partial.left !== undefined ? { left: partial.left } : {}),
		...(partial.right !== undefined ? { right: partial.right } : {}),
		...(partial.candleStyle !== undefined
			? { candleStyle: { ...base.candleStyle, ...partial.candleStyle } }
			: {}),
	};
}
