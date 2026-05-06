import type { CustomData } from 'lightweight-charts';

/**
 * One price row inside an enriched candle. `values` is sparse: missing `metricId`
 * keys render as empty unless the column defines a {@link FootprintColumnDef.placeholder}.
 */
export interface FootprintLevelRow {
	readonly price: number;
	/** Sparse metric values keyed by stable `metricId` (RFC §5.2). */
	readonly values: Readonly<Record<string, number>>;
	readonly flags?: readonly string[];
}

/**
 * Server- or client-enriched OHLC bar with optional footprint levels.
 *
 * Time axis (PRD / RFC §5.2):
 * - compress (default): omit logical points for removed buckets; the time scale collapses like a standard series.
 * - retainGap: supply CustomSeriesWhitespaceData-shaped points (no OHLC) or whitespace rows so the clock keeps continuity; pair with filteredBarTimeAxis: 'retainGap'.
 */
export interface EnrichedCandle<HorzScaleItem = unknown> extends CustomData<HorzScaleItem> {
	readonly open: number;
	readonly high: number;
	readonly low: number;
	readonly close: number;
	readonly levels: readonly FootprintLevelRow[];
	/** Last-writer-wins corrections when the same `time` is updated with a higher revision. */
	readonly revision?: number;
}
