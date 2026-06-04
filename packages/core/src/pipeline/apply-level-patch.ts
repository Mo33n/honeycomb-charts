import type { ISeriesApi } from 'lightweight-charts';
import type { WhitespaceData } from 'lightweight-charts';

import type { HoneycombSeriesOptions } from '../options/footprint-series-options.js';
import type { EnrichedCandle, FootprintLevelRow } from '../schema/types.js';
import { findLevelIndexByPrice } from '../schema/price-level-match.js';
import { MAX_LEVELS_PER_BAR, sanitizeEnrichedCandle, type SanitizeFootprintOptions } from '../schema/sanitize.js';

/**
 * Single-row footprint update for Path A / host-driven flows (RFC §5.9).
 *
 * **Threading:** call only from the same execution context as `lightweight-charts`
 * (browser main thread or single worker owning the chart); do not invoke concurrently
 * from multiple threads against one `series` instance.
 */
export interface ApplyFootprintLevelPatchInput<HorzScaleItem> {
	readonly time: HorzScaleItem;
	readonly price: number;
	/** Only keys listed in visible column defs are merged; unknown keys are ignored (silent). */
	readonly values: Readonly<Partial<Record<string, number>>>;
	/**
	 * When set, must be **≥** existing bar `revision` if one was already set; lower values throw.
	 * When omitted, existing `revision` is preserved (if any).
	 */
	readonly revision?: number;
}

export type FootprintPatchSeriesApi<HorzScaleItem> = Pick<
	ISeriesApi<
		'Custom',
		HorzScaleItem,
		EnrichedCandle<HorzScaleItem> | WhitespaceData<HorzScaleItem>,
		HoneycombSeriesOptions,
		unknown
	>,
	'data' | 'update' | 'options'
>;

function isEnrichedFootprintBar<HorzScaleItem>(
	bar: EnrichedCandle<HorzScaleItem> | WhitespaceData<HorzScaleItem>
): bar is EnrichedCandle<HorzScaleItem> {
	const b = bar as { open?: unknown; levels?: unknown };
	return typeof b.open === 'number' && Array.isArray(b.levels);
}

function visibleMetricIds(options: HoneycombSeriesOptions): ReadonlySet<string> {
	const s = new Set<string>();
	for (const side of [options.left, options.right]) {
		for (const col of side.columns) {
			if (col.visible) {
				s.add(col.metricId);
			}
		}
	}
	return s;
}

function findBarIndex<HorzScaleItem>(
	data: readonly (EnrichedCandle<HorzScaleItem> | WhitespaceData<HorzScaleItem>)[],
	time: HorzScaleItem
): number {
	for (let i = 0; i < data.length; i++) {
		if (data[i]!.time === time) {
			return i;
		}
	}
	return -1;
}

/**
 * Returns a new `levels` array that **reuses** unmodified `FootprintLevelRow` object references
 * (structural sharing — RFC §5.9 / HC1-011).
 *
 * Not re-exported from the package root; sanitizer still clones rows for the stored model.
 */
export function mergeLevelsStructural(
	levels: readonly FootprintLevelRow[],
	rowIndex: number,
	mergedValues: Record<string, number>
): FootprintLevelRow[] {
	return levels.map((row, i) => {
		if (i !== rowIndex) {
			return row;
		}
		const prev = levels[rowIndex]!;
		return {
			price: prev.price,
			values: { ...prev.values, ...mergedValues },
			...(prev.flags !== undefined ? { flags: prev.flags } : {}),
		};
	});
}

/**
 * Merges sparse `values` into one `(time, price)` row and calls `series.update` with a sanitized candle.
 *
 * **Primary v1.1 API** for partial footprint row updates (see `docs/partial-updates-v1.1.md`).
 */
export function applyFootprintLevelPatch<HorzScaleItem>(
	series: FootprintPatchSeriesApi<HorzScaleItem>,
	input: ApplyFootprintLevelPatchInput<HorzScaleItem>,
	sanitizeOptions?: SanitizeFootprintOptions
): void {
	const data = series.data();
	const idx = findBarIndex(data, input.time);
	if (idx < 0) {
		throw new RangeError(`applyFootprintLevelPatch: no series bar at time=${String(input.time)}`);
	}
	const current = data[idx]!;
	if (!isEnrichedFootprintBar(current)) {
		throw new TypeError('applyFootprintLevelPatch: target bar is whitespace or missing OHLC/levels');
	}

	const allowed = visibleMetricIds(series.options());
	const levels = current.levels;
	const price = input.price;
	const rowIndex = findLevelIndexByPrice(levels, price);

	const mergedValues: Record<string, number> =
		rowIndex >= 0 ? { ...levels[rowIndex]!.values } : {};

	for (const [k, v] of Object.entries(input.values)) {
		if (!allowed.has(k)) {
			continue;
		}
		if (typeof v === 'number' && Number.isFinite(v)) {
			mergedValues[k] = v;
		}
	}

	let nextLevels: FootprintLevelRow[];
	if (rowIndex >= 0) {
		nextLevels = mergeLevelsStructural(levels, rowIndex, mergedValues);
	} else {
		if (Object.keys(mergedValues).length === 0) {
			return;
		}
		if (levels.length >= MAX_LEVELS_PER_BAR) {
			throw new RangeError(
				`applyFootprintLevelPatch: cannot add new price row; bar already has ${String(MAX_LEVELS_PER_BAR)} levels`
			);
		}
		nextLevels = [...levels, { price, values: { ...mergedValues } }];
	}

	const prevRev = current.revision;
	let revision: number | undefined;
	if (input.revision !== undefined) {
		if (prevRev !== undefined && input.revision < prevRev) {
			throw new RangeError(
				`applyFootprintLevelPatch: revision ${String(input.revision)} < existing ${String(prevRev)}`
			);
		}
		revision = input.revision;
	} else {
		revision = prevRev;
	}

	const draft: EnrichedCandle<HorzScaleItem> = {
		...current,
		open: current.open,
		high: current.high,
		low: current.low,
		close: current.close,
		levels: nextLevels,
		...(revision !== undefined ? { revision } : {}),
	};

	const { candle } = sanitizeEnrichedCandle(draft, sanitizeOptions);
	series.update(candle);
}
