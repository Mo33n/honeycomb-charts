import type { EnrichedCandle, FootprintLevelRow } from '../schema/types.js';

export interface RowVerticalBand {
	readonly topPx: number;
	readonly bottomPx: number;
	readonly row: FootprintLevelRow;
}

export type PriceToY = (price: number) => number | null;

/**
 * Maps each footprint row to vertical bands between midpoints of adjacent sorted prices,
 * extended to the bar's `[low, high]` range.
 *
 * When `conflationFactor > 1`, host data may already be merged; this stays pure geometry (RFC §5.5).
 */
export function buildRowVerticalBands(
	candle: EnrichedCandle<unknown>,
	levels: readonly FootprintLevelRow[],
	priceToY: PriceToY
): readonly RowVerticalBand[] {
	if (levels.length === 0) {
		return [];
	}

	const low = candle.low;
	const high = candle.high;
	const sorted = [...levels].sort((a, b) => a.price - b.price);
	const bands: RowVerticalBand[] = [];

	for (let i = 0; i < sorted.length; i++) {
		const row = sorted[i]!;
		const upperPriceRaw = i < sorted.length - 1
			? (row.price + sorted[i + 1]!.price) * 0.5
			: Math.max(row.price, high);
		const lowerPriceRaw = i > 0
			? (sorted[i - 1]!.price + row.price) * 0.5
			: Math.min(row.price, low);

		const upperPrice = Math.min(Math.max(upperPriceRaw, low), high);
		const lowerPrice = Math.min(Math.max(lowerPriceRaw, low), high);
		const pTop = Math.max(upperPrice, lowerPrice);
		const pBot = Math.min(upperPrice, lowerPrice);

		const y1 = priceToY(pTop);
		const y2 = priceToY(pBot);
		if (y1 === null || y2 === null) {
			continue;
		}
		bands.push({
			topPx: Math.min(y1, y2),
			bottomPx: Math.max(y1, y2),
			row,
		});
	}

	return bands;
}
