import type { FootprintLevelRow } from '../schema/types.js';
import type { BarMetricScope } from '../options/footprint-series-options.js';

/**
 * Maximum absolute value for `metricId` across all levels in one bar (PRD per-bar scope).
 */
export function maxAbsMetricInBar(levels: readonly FootprintLevelRow[], metricId: string): number {
	let m = 0;
	for (const row of levels) {
		const v = row.values[metricId];
		if (typeof v === 'number' && Number.isFinite(v)) {
			m = Math.max(m, Math.abs(v));
		}
	}
	return Math.max(1e-9, m);
}

/**
 * Build max |value| per bar metric column across the visible logical range (per-visible-window scope).
 */
export function maxAbsBarMetricsVisibleWindow(
	levelsByBar: readonly (readonly FootprintLevelRow[])[],
	barMetricIds: ReadonlySet<string>
): ReadonlyMap<string, number> {
	const out = new Map<string, number>();
	for (const mid of barMetricIds) {
		out.set(mid, 0);
	}
	for (const levels of levelsByBar) {
		for (const row of levels) {
			for (const mid of barMetricIds) {
				const v = row.values[mid];
				if (typeof v === 'number' && Number.isFinite(v)) {
					const cur = out.get(mid) ?? 0;
					out.set(mid, Math.max(cur, Math.abs(v)));
				}
			}
		}
	}
	for (const mid of barMetricIds) {
		const v = out.get(mid) ?? 0;
		out.set(mid, Math.max(1e-9, v));
	}
	return out;
}

export function normalizedBarValue(
	value: number | undefined,
	metricId: string,
	scope: BarMetricScope,
	allLevelsInBar: readonly FootprintLevelRow[],
	windowMax: ReadonlyMap<string, number> | null
): number {
	if (value === undefined || !Number.isFinite(value)) {
		return 0;
	}
	const denom = scope === 'perBar'
		? maxAbsMetricInBar(allLevelsInBar, metricId)
		: (windowMax?.get(metricId) ?? 1e-9);
	return Math.max(-1, Math.min(1, value / denom));
}
