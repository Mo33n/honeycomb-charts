import type { FootprintLevelRow } from './types.js';

const DEFAULT_PRICE_EPSILON = 1e-9;

/** Compares prices with tolerance for floating-point representation drift. */
export function pricesEqual(a: number, b: number, epsilon = DEFAULT_PRICE_EPSILON): boolean {
	if (a === b) {
		return true;
	}
	const scale = Math.max(1, Math.abs(a), Math.abs(b));
	return Math.abs(a - b) <= epsilon * scale;
}

/** Finds a level row index by price; returns -1 when no row matches within tolerance. */
export function findLevelIndexByPrice(
	levels: readonly FootprintLevelRow[],
	price: number,
	epsilon = DEFAULT_PRICE_EPSILON
): number {
	for (let i = 0; i < levels.length; i++) {
		if (pricesEqual(levels[i]!.price, price, epsilon)) {
			return i;
		}
	}
	return -1;
}
