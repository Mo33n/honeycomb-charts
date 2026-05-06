import type { SegmentProfileRuleRow } from './catalog-layout-complexity.js';

/**
 * Reads `segmentProfiles[segmentProfileRef].rules` for a layout row that declares `segmentProfileRef`.
 * Uses raw catalog JSON only — no compiler.
 */
export function segmentProfileRulesForHostLayout(
	catalog: Record<string, unknown>,
	hostLayoutId: string
): SegmentProfileRuleRow[] | null {
	const layouts = catalog.layouts;
	if (!Array.isArray(layouts)) {
		return null;
	}
	const row = layouts.find(
		(l: unknown) => l && typeof l === 'object' && (l as { id?: string }).id === hostLayoutId
	) as { segmentProfileRef?: unknown } | undefined;
	const refRaw = row?.segmentProfileRef;
	const ref = typeof refRaw === 'string' ? refRaw.trim() : '';
	if (!ref) {
		return null;
	}
	const profiles = catalog.segmentProfiles;
	if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
		return null;
	}
	const prof = (profiles as Record<string, unknown>)[ref];
	if (!prof || typeof prof !== 'object' || Array.isArray(prof)) {
		return null;
	}
	const rulesRaw = (prof as { rules?: unknown }).rules;
	if (!Array.isArray(rulesRaw)) {
		return null;
	}
	const rules: SegmentProfileRuleRow[] = [];
	for (const r of rulesRaw) {
		if (!r || typeof r !== 'object') {
			continue;
		}
		const minWidthPx = (r as { minWidthPx?: unknown }).minWidthPx;
		const layoutId = (r as { layoutId?: unknown }).layoutId;
		if (typeof minWidthPx !== 'number' || !Number.isFinite(minWidthPx)) {
			continue;
		}
		if (typeof layoutId !== 'string' || !layoutId.trim()) {
			continue;
		}
		rules.push({ minWidthPx, layoutId });
	}
	return rules.length > 0 ? rules : null;
}
