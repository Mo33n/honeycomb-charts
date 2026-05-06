/**
 * Viewport-driven layout selection with Schmitt-style hysteresis (CT-P2-10 / CT-P2-11).
 * @module honeycomb/lib/segment-profile
 */

/**
 * @typedef {{ minWidthPx: number; layoutId: string }} SegmentProfileRule
 */

/**
 * @typedef {{
 *   hysteresisPx?: number;
 *   rules: readonly SegmentProfileRule[];
 * }} SegmentProfileSelector
 */

/**
 * @typedef {{
 *   lastCommittedLayoutId: string | null;
 *   lastWidthPx: number | null;
 * }} SegmentProfileResolutionState
 */

/**
 * @param {number} widthPx
 * @param {readonly SegmentProfileRule[]} sortedAsc rules sorted by `minWidthPx` ascending
 * @returns {string}
 */
export function pickLayoutIdForWidth(widthPx, sortedAsc) {
	if (sortedAsc.length === 0) {
		throw new Error('segment profile: rules must be non-empty');
	}
	let id = sortedAsc[0].layoutId;
	for (const r of sortedAsc) {
		if (widthPx >= r.minWidthPx) {
			id = r.layoutId;
		}
	}
	return id;
}

/**
 * Smallest breakpoint `px` where `pick(px-ε)` and `pick(px+ε)` differ and one side matches `a` and the other `b`.
 *
 * @param {readonly SegmentProfileRule[]} sortedAsc
 * @param {string} layoutIdA
 * @param {string} layoutIdB
 * @returns {number | null}
 */
export function breakpointBetweenLayouts(sortedAsc, layoutIdA, layoutIdB) {
	const eps = 1e-6;
	const bps = sortedAsc.map(r => r.minWidthPx).filter((_, i) => i > 0);
	for (const px of bps) {
		const below = pickLayoutIdForWidth(px - eps, sortedAsc);
		const above = pickLayoutIdForWidth(px + eps, sortedAsc);
		if ((below === layoutIdA && above === layoutIdB) || (below === layoutIdB && above === layoutIdA)) {
			return px;
		}
	}
	return null;
}

/**
 * @param {number} widthPx
 * @param {SegmentProfileSelector} selector
 * @param {SegmentProfileResolutionState} state
 * @returns {{ layoutId: string; lastCommittedLayoutId: string; lastWidthPx: number }}
 */
export function resolveSegmentProfileLayoutId(widthPx, selector, state) {
	const sorted = [...selector.rules].sort((a, b) => a.minWidthPx - b.minWidthPx);
	const hyst = selector.hysteresisPx ?? 4;
	const instant = pickLayoutIdForWidth(widthPx, sorted);
	const committed = state.lastCommittedLayoutId ?? instant;
	const prevW = state.lastWidthPx ?? widthPx;

	if (committed === instant) {
		return { layoutId: committed, lastCommittedLayoutId: committed, lastWidthPx: widthPx };
	}

	const b = breakpointBetweenLayouts(sorted, committed, instant);
	if (b === null) {
		return { layoutId: instant, lastCommittedLayoutId: instant, lastWidthPx: widthPx };
	}

	const goingUp = widthPx > prevW;
	if (goingUp && widthPx >= b + hyst) {
		return { layoutId: instant, lastCommittedLayoutId: instant, lastWidthPx: widthPx };
	}
	if (!goingUp && widthPx <= b - hyst) {
		return { layoutId: instant, lastCommittedLayoutId: instant, lastWidthPx: widthPx };
	}

	return { layoutId: committed, lastCommittedLayoutId: committed, lastWidthPx: widthPx };
}
