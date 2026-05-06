import type { EnrichedCandle } from '../schema/types.js';

function assertFiniteReplayScalar(label: string, t: number): void {
	if (!Number.isFinite(t)) {
		throw new Error(`Footprint replay: ${label} must be a finite number (got ${String(t)}).`);
	}
}

function assertFiniteBarTimes<Time extends number>(bars: readonly EnrichedCandle<Time>[], context: string): void {
	for (let i = 0; i < bars.length; i++) {
		const t = bars[i].time as number;
		if (!Number.isFinite(t)) {
			throw new Error(
				`Footprint replay: ${context} bar at index ${i} has non-finite time (${String(bars[i].time)}).`
			);
		}
	}
}

/**
 * Min/max bar time over a finite bar array (replay scrub domain).
 */
export interface FootprintReplayDomain<Time extends number> {
	readonly firstBarTime: Time;
	readonly lastBarTime: Time;
}

/**
 * Returns the min and max `time` over `bars`, or `null` if empty.
 * Every `bars[i].time` must satisfy `Number.isFinite` or this throws.
 */
export function deriveFootprintReplayDomain<Time extends number>(
	bars: readonly EnrichedCandle<Time>[]
): FootprintReplayDomain<Time> | null {
	if (bars.length === 0) {
		return null;
	}
	assertFiniteBarTimes(bars, 'deriveFootprintReplayDomain');
	let minT = bars[0].time;
	let maxT = bars[0].time;
	for (let i = 1; i < bars.length; i++) {
		const t = bars[i].time;
		if (t < minT) {
			minT = t;
		}
		if (t > maxT) {
			maxT = t;
		}
	}
	return { firstBarTime: minT, lastBarTime: maxT };
}

/**
 * Clamps `playhead` into `[domain.firstBarTime, domain.lastBarTime]`.
 * `playhead` and both domain endpoints must be finite or this throws.
 */
export function clampFootprintReplayPlayhead<Time extends number>(
	playhead: Time,
	domain: FootprintReplayDomain<Time>
): Time {
	assertFiniteReplayScalar('playhead', playhead as number);
	assertFiniteReplayScalar('domain.firstBarTime', domain.firstBarTime as number);
	assertFiniteReplayScalar('domain.lastBarTime', domain.lastBarTime as number);
	if (playhead < domain.firstBarTime) {
		return domain.firstBarTime;
	}
	if (playhead > domain.lastBarTime) {
		return domain.lastBarTime;
	}
	return playhead;
}

/**
 * Bars with `time <= playheadInclusive`, preserving input order.
 * No `window` / `document` — safe for SSR and unit tests.
 * `playheadInclusive` and every `bars[i].time` must be finite or this throws.
 */
export function filterEnrichedCandlesAtOrBeforePlayhead<Time extends number>(
	bars: readonly EnrichedCandle<Time>[],
	playheadInclusive: Time
): EnrichedCandle<Time>[] {
	assertFiniteReplayScalar('playheadInclusive', playheadInclusive as number);
	assertFiniteBarTimes(bars, 'filterEnrichedCandlesAtOrBeforePlayhead');
	const out: EnrichedCandle<Time>[] = [];
	for (let i = 0; i < bars.length; i++) {
		const b = bars[i];
		if (b.time <= playheadInclusive) {
			out.push(b);
		}
	}
	return out;
}

/**
 * Throws if any bar has `time > playheadInclusive` **or** any involved time is non-finite.
 *
 * **Cost / use:** **O(bars.length)** — for **dev builds, tests, or occasional host assertions** after
 * mutations — **not** for tight per-frame hot paths in production.
 */
export function assertFootprintReplayHasNoFutureBars<Time extends number>(
	bars: readonly EnrichedCandle<Time>[],
	playheadInclusive: Time
): void {
	assertFiniteReplayScalar('playheadInclusive', playheadInclusive as number);
	assertFiniteBarTimes(bars, 'assertFootprintReplayHasNoFutureBars');
	for (let i = 0; i < bars.length; i++) {
		if (bars[i].time > playheadInclusive) {
			throw new Error(
				`Footprint replay contract: bar at index ${i} has time > playhead (no future bars).`
			);
		}
	}
}
