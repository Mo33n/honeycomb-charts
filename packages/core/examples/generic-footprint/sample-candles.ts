import type { UTCTimestamp } from 'lightweight-charts';

import type { EnrichedCandle, FootprintLevelRow } from 'honeycomb-charts';

const BAR_SPACING_SEC = 60;
const BASE_TIME = 1_710_000_000 as UTCTimestamp;

function level(price: number, bid: number, ask: number): { price: number; values: Record<string, number> } {
	const vol = bid + ask;
	const delta = bid - ask;
	return { price, values: { bid, ask, vol, delta } };
}

/** **24** synthetic footprint bars with several price levels each (Δ / vol / Δ-histogram layout). */
export function buildGenericFootprintSampleData(): EnrichedCandle<UTCTimestamp>[] {
	const out: EnrichedCandle<UTCTimestamp>[] = [];
	for (let i = 0; i < 24; i++) {
		const t = (BASE_TIME + i * BAR_SPACING_SEC) as UTCTimestamp;
		const o = 100 + i * 0.04;
		const c = 100.5 + i * 0.04;
		const h = Math.max(o, c) + 0.85;
		const l = Math.min(o, c) - 0.85;
		const span = h - l;
		const levelCount = 7;
		const levels: FootprintLevelRow[] = [];
		for (let k = 0; k < levelCount; k++) {
			const frac = levelCount === 1 ? 0.5 : k / (levelCount - 1);
			const price = l + frac * span * 0.92 + span * 0.04;
			const wave = Math.sin(i * 0.85 + k * 0.55);
			const bias = (i % 5) - 2;
			const bid = Math.round(18 + 40 * wave * wave + k * 4 + bias * 3);
			const ask = Math.round(22 + 38 * (1 - wave * wave) + (i % 4) * 2 + k * 2);
			levels.push(level(price, Math.max(1, bid), Math.max(1, ask)));
		}
		out.push({
			time: t,
			open: o,
			high: h,
			low: l,
			close: c,
			levels,
		});
	}
	return out;
}
