import type { EnrichedCandle, HoneycombSeriesOptions } from 'honeycomb-charts';

/** Which end of the static pool to take when `visibleBarCount` &lt; pool length. */
export type StaticDatasetSliceMode = 'first' | 'last';

/**
 * Controls how many footprint bars are shown and optional series option overrides.
 * Edit this object (or merge from your app) to change the demo.
 */
export interface StaticDatasetChartDisplayConfig {
	/** Number of bars passed to `series.setData` (clamped to pool length, minimum 1). */
	readonly visibleBarCount: number;
	/** `first`: earliest bars; `last`: most recent bars (typical desk default). */
	readonly sliceMode: StaticDatasetSliceMode;
	/** Shallow merge on top of `defaultHoneycombSeriesOptions` via `mergeHoneycombSeriesOptions`. */
	readonly seriesOptionsPatch?: Partial<HoneycombSeriesOptions>;
}

/** Default: show **20** most recent candles from the static pool. */
export const defaultStaticDatasetChartDisplayConfig: StaticDatasetChartDisplayConfig = {
	visibleBarCount: 20,
	sliceMode: 'last',
	seriesOptionsPatch: {
		priceLineVisible: false,
		/** Slightly larger floor than library default (8) — better first-run / laptop readability. */
		minFontPx: 10,
		maxFontPx: 14,
		minCellHeightPx: 6,
		/** Reference-style bid/ask: directional volume strips + rule-based hot cell outline/text. */
		left: {
			columns: [
				{
					metricId: 'bid',
					kind: 'number',
					visible: true,
					weight: 1,
					style: {
						numberHistogram: {
							sourceMetricId: 'bid',
							direction: 'left',
							color: 'rgba(239, 83, 80, 0.48)',
						},
					},
					colorRules: [
						{
							when: { op: 'cmp', metric: 'bid', cmp: 'gt', value: 35 },
							style: {
								textColor: '#ffab91',
								cellOutline: { color: 'rgba(255, 214, 0, 0.92)', widthPx: 1.25 },
							},
						},
					],
				},
				{
					metricId: 'ask',
					kind: 'number',
					visible: true,
					weight: 1,
					style: {
						numberHistogram: {
							sourceMetricId: 'ask',
							direction: 'right',
							color: 'rgba(100, 181, 246, 0.52)',
						},
					},
					colorRules: [
						{
							when: { op: 'cmp', metric: 'ask', cmp: 'gt', value: 22 },
							style: {
								textColor: '#90caf9',
								cellOutline: { color: 'rgba(255, 214, 0, 0.92)', widthPx: 1.25 },
							},
						},
					],
				},
			],
		},
	},
};

/**
 * Returns a mutable copy of up to `visibleBarCount` candles from `pool`.
 */
export function selectVisibleEnrichedCandles<Time extends number>(
	pool: readonly EnrichedCandle<Time>[],
	config: Pick<StaticDatasetChartDisplayConfig, 'visibleBarCount' | 'sliceMode'>
): EnrichedCandle<Time>[] {
	const poolLen = pool.length;
	if (poolLen === 0) {
		return [];
	}
	let n = Math.floor(config.visibleBarCount);
	if (!Number.isFinite(n) || n < 1) {
		n = 1;
	}
	n = Math.min(n, poolLen);
	if (config.sliceMode === 'first') {
		return pool.slice(0, n) as EnrichedCandle<Time>[];
	}
	return pool.slice(poolLen - n) as EnrichedCandle<Time>[];
}
