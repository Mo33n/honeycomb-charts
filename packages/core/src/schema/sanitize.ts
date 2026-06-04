import type { EnrichedCandle, FootprintLevelRow } from './types.js';

/** PM / RFC cap: supported tier ≤256 rows per bar. */
export const MAX_LEVELS_PER_BAR = 256;

export interface SanitizeFootprintOptions {
	readonly maxLevels?: number;
}

export interface SanitizeFootprintResult<HorzScaleItem> {
	readonly candle: EnrichedCandle<HorzScaleItem>;
	readonly droppedLevels: number;
	readonly warnings: readonly string[];
}

function isFiniteNumber(n: unknown): n is number {
	return typeof n === 'number' && Number.isFinite(n);
}

function sanitizeLevel(row: FootprintLevelRow, warnings: string[]): FootprintLevelRow {
	if (!isFiniteNumber(row.price)) {
		throw new TypeError('FootprintLevelRow.price must be a finite number');
	}
	const nextValues: Record<string, number> = {};
	for (const [k, v] of Object.entries(row.values)) {
		if (!isFiniteNumber(v)) {
			warnings.push(`Dropped non-finite value for metric "${k}" at price ${row.price}`);
			continue;
		}
		nextValues[k] = v;
	}
	return {
		price: row.price,
		values: nextValues,
		...(row.flags !== undefined ? { flags: row.flags } : {}),
	};
}

/**
 * Validates and clamps enriched candles for the renderer (PRD C6 / RFC §5.2).
 * Throws on non-recoverable shape errors; records warnings for dropped cells.
 */
export function sanitizeEnrichedCandle<HorzScaleItem>(
	raw: EnrichedCandle<HorzScaleItem>,
	options?: SanitizeFootprintOptions
): SanitizeFootprintResult<HorzScaleItem> {
	const maxLevels = options?.maxLevels ?? MAX_LEVELS_PER_BAR;
	const warnings: string[] = [];

	if (!isFiniteNumber(raw.open) || !isFiniteNumber(raw.high) || !isFiniteNumber(raw.low) || !isFiniteNumber(raw.close)) {
		throw new TypeError('EnrichedCandle OHLC fields must be finite numbers');
	}

	let levels = [...raw.levels];
	let droppedLevels = 0;
	if (levels.length > maxLevels) {
		droppedLevels = levels.length - maxLevels;
		const mid = (raw.high + raw.low) / 2;
		levels.sort((a, b) => Math.abs(a.price - mid) - Math.abs(b.price - mid));
		levels = levels.slice(0, maxLevels);
		warnings.push(`Clamped levels from ${raw.levels.length} to ${maxLevels} (kept rows nearest OHLC mid)`);
	}

	const sanitizedLevels = levels.map(l => sanitizeLevel(l, warnings));

	const revision = raw.revision === undefined ? undefined : (isFiniteNumber(raw.revision) ? raw.revision : (warnings.push('Ignored non-finite revision'), undefined));

	const candle: EnrichedCandle<HorzScaleItem> = {
		...raw,
		open: raw.open,
		high: raw.high,
		low: raw.low,
		close: raw.close,
		levels: sanitizedLevels,
		...(revision !== undefined ? { revision } : {}),
	};

	return { candle, droppedLevels, warnings };
}
