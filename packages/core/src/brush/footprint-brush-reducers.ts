import type { UTCTimestamp } from 'lightweight-charts';

import type { FootprintSegmentSide } from '../options/footprint-series-options.js';
import type { EnrichedCandle } from '../schema/types.js';
import type {
	FootprintBrushInterval,
	FootprintCustomReducerContext,
	FootprintCustomReducerFn,
	FootprintReducerId,
	FootprintReducerResult,
} from './footprint-brush-contract.js';

/** Options for {@link runFootprintBrushReducers}. */
export interface FootprintBrushReducerRunOptions {
	/**
	 * Metric used by **`sum`** / **`max`** / **`min`** when set; otherwise {@link resolveDefaultBrushTargetMetricId} uses **`leftSegment`**.
	 */
	readonly targetMetricId?: string;
	/** Left segment layout for default metric (first visible **`number`** column). */
	readonly leftSegment?: FootprintSegmentSide;
	/** Required when **`reducerIds`** includes **`custom`** (otherwise **`custom`** is skipped). */
	readonly customReducer?: FootprintCustomReducerFn;
	readonly customReducerContext?: FootprintCustomReducerContext;
}

/**
 * First **`visible`** left-segment column with **`kind: 'number'`**, else **`undefined`**.
 */
export function resolveDefaultBrushTargetMetricId(left: FootprintSegmentSide | undefined): string | undefined {
	if (left === undefined) {
		return undefined;
	}
	for (const c of left.columns) {
		if (c.visible && c.kind === 'number') {
			return c.metricId;
		}
	}
	return undefined;
}

/**
 * Returns a new interval with **`from <= to`** (UTC seconds).
 */
export function normalizeFootprintBrushInterval(interval: FootprintBrushInterval): FootprintBrushInterval {
	if (interval.from <= interval.to) {
		return interval;
	}
	return { from: interval.to, to: interval.from };
}

/**
 * Bars whose **`time`** lies in the **normalized** inclusive UTC range.
 */
export function filterBarsByFootprintBrush<T extends UTCTimestamp>(
	bars: readonly EnrichedCandle<T>[],
	interval: FootprintBrushInterval
): readonly EnrichedCandle<T>[] {
	const { from, to } = normalizeFootprintBrushInterval(interval);
	return bars.filter(b => {
		const t = b.time as number;
		return t >= from && t <= to;
	});
}

function metricTarget(options: FootprintBrushReducerRunOptions): string | undefined {
	return options.targetMetricId ?? resolveDefaultBrushTargetMetricId(options.leftSegment);
}

type FootprintLevelRowUtc = EnrichedCandle<UTCTimestamp>['levels'][number];

function* iterBarLevels(
	bars: readonly EnrichedCandle<UTCTimestamp>[]
): Generator<{ readonly bar: EnrichedCandle<UTCTimestamp>; readonly row: FootprintLevelRowUtc }> {
	for (const bar of bars) {
		for (const row of bar.levels) {
			yield { bar, row };
		}
	}
}

function reducerSum(bars: readonly EnrichedCandle<UTCTimestamp>[], metricId: string): number {
	let s = 0;
	for (const { row } of iterBarLevels(bars)) {
		const v = row.values[metricId];
		if (typeof v === 'number' && Number.isFinite(v)) {
			s += v;
		}
	}
	return s;
}

function reducerMax(bars: readonly EnrichedCandle<UTCTimestamp>[], metricId: string): number {
	let found = false;
	let m = -Infinity;
	for (const { row } of iterBarLevels(bars)) {
		const v = row.values[metricId];
		if (typeof v === 'number' && Number.isFinite(v)) {
			found = true;
			if (v > m) {
				m = v;
			}
		}
	}
	return found ? m : NaN;
}

function reducerMin(bars: readonly EnrichedCandle<UTCTimestamp>[], metricId: string): number {
	let found = false;
	let m = Infinity;
	for (const { row } of iterBarLevels(bars)) {
		const v = row.values[metricId];
		if (typeof v === 'number' && Number.isFinite(v)) {
			found = true;
			if (v < m) {
				m = v;
			}
		}
	}
	return found ? m : NaN;
}

function reducerSparseMetricSum(
	bars: readonly EnrichedCandle<UTCTimestamp>[],
	key: 'delta' | 'volume'
): number {
	let sum = 0;
	let anyKey = false;
	for (const { row } of iterBarLevels(bars)) {
		if (Object.prototype.hasOwnProperty.call(row.values, key)) {
			anyKey = true;
			const v = row.values[key];
			if (typeof v === 'number' && Number.isFinite(v)) {
				sum += v;
			}
		}
	}
	return anyKey ? sum : NaN;
}

function reducerRowCount(bars: readonly EnrichedCandle<UTCTimestamp>[]): number {
	const seen = new Set<string>();
	for (const { bar, row } of iterBarLevels(bars)) {
		const t = bar.time as number;
		seen.add(`${t}\n${row.price}`);
	}
	return seen.size;
}

/**
 * Runs the requested built-in reducers (and optionally **`custom`**) over **`bars`**.
 *
 * - **`bars.length === 0`** or **`reducerIds.length === 0`** → **`{}`**, no throw.
 * - **`custom`**: `runFootprintBrushReducers` calls **`customReducer` once** per invocation; loops inside it are **host-bounded** (≤ **`bars.length`** outer iterations recommended; see `docs/brush-reducers-v1.2.md`).
 */
export function runFootprintBrushReducers(
	bars: readonly EnrichedCandle<UTCTimestamp>[],
	reducerIds: readonly FootprintReducerId[],
	options: FootprintBrushReducerRunOptions = {}
): FootprintReducerResult {
	if (bars.length === 0 || reducerIds.length === 0) {
		return {};
	}

	const out: Record<string, number> = {};
	const metricId = metricTarget(options);

	for (const id of reducerIds) {
		switch (id) {
			case 'sum':
				if (metricId !== undefined) {
					out.sum = reducerSum(bars, metricId);
				}
				break;
			case 'max':
				if (metricId !== undefined) {
					out.max = reducerMax(bars, metricId);
				}
				break;
			case 'min':
				if (metricId !== undefined) {
					out.min = reducerMin(bars, metricId);
				}
				break;
			case 'deltaSum':
				out.deltaSum = reducerSparseMetricSum(bars, 'delta');
				break;
			case 'volumeSum':
				out.volumeSum = reducerSparseMetricSum(bars, 'volume');
				break;
			case 'rowCount':
				out.rowCount = reducerRowCount(bars);
				break;
			case 'custom':
				if (options.customReducer !== undefined && options.customReducerContext !== undefined) {
					const customOut = options.customReducer(bars, options.customReducerContext);
					for (const [k, v] of Object.entries(customOut)) {
						if (typeof v === 'number') {
							out[k] = v;
						}
					}
				}
				break;
		}
	}

	return out;
}
