/** Rules row matching honeycomb `segmentProfiles.*.rules`. */
export type SegmentProfileRuleRow = { minWidthPx: number; layoutId: string };

export function sumTrackWeightsForLayout(catalog: Record<string, unknown>, layoutId: string): number {
	const layouts = catalog.layouts;
	if (!Array.isArray(layouts)) {
		return 1;
	}
	const row = layouts.find(
		(l: unknown) => l && typeof l === 'object' && (l as { id?: string }).id === layoutId
	) as { segment?: { trackWeights?: unknown } } | undefined;
	const w = row?.segment?.trackWeights;
	if (!Array.isArray(w) || w.length === 0) {
		return 1;
	}
	let sum = 0;
	for (const x of w) {
		if (typeof x === 'number' && Number.isFinite(x) && x > 0) {
			sum += x;
		}
	}
	return Math.max(1, sum);
}

/** Median Σ `trackWeights` across layout ids listed in the segment profile rules. */
export function medianProfileTrackWeightFromRules(
	catalog: Record<string, unknown>,
	rules: readonly SegmentProfileRuleRow[]
): number {
	if (rules.length === 0) {
		return 1;
	}
	const sums = rules.map(r => sumTrackWeightsForLayout(catalog, r.layoutId)).sort((a, b) => a - b);
	return Math.max(1, sums[Math.floor(sums.length / 2)] ?? 1);
}

/** Smallest positive `minWidthPx` — aligns per-bar synthetic width to the first tier above the base layout. */
export function smallestPositiveProfileBreakpointPx(rules: readonly { minWidthPx: number }[]): number {
	const positives = rules.map(r => r.minWidthPx).filter(w => typeof w === 'number' && Number.isFinite(w) && w > 0);
	return positives.length > 0 ? Math.min(...positives) : 1;
}
