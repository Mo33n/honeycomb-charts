import type { UTCTimestamp } from 'lightweight-charts';

import type { EnrichedCandle } from 'honeycomb-charts';

/** Seconds between consecutive bar `time` values (one-minute bars). */
export const STATIC_DATASET_BAR_SPACING_SEC = 60;

/** First bar time (Unix seconds). */
export const STATIC_DATASET_BASE_TIME = 1_710_000_000 as UTCTimestamp;

/**
 * Fixed pool of enriched candles for demos. The chart shows a **slice** of this pool;
 * size and position are controlled by {@link defaultStaticDatasetChartDisplayConfig}.
 */
export function buildStaticEnrichedCandlePool(): readonly EnrichedCandle<UTCTimestamp>[] {
	const pool: EnrichedCandle<UTCTimestamp>[] = [];
	const base = STATIC_DATASET_BASE_TIME;
	const step = STATIC_DATASET_BAR_SPACING_SEC;
	for (let i = 0; i < 30; i++) {
		pool.push({
			time: (base + i * step) as UTCTimestamp,
			open: 100 + i * 0.04,
			high: 101 + i * 0.04,
			low: 99 + i * 0.04,
			close: 100.5 + i * 0.04,
			levels: [
				{ price: 100, values: { bid: 18 + i, ask: 12, delta: 6 } },
				{ price: 101, values: { bid: 4, ask: 8 + i, delta: -4 } },
			],
		});
	}
	return pool;
}

export const STATIC_ENRICHED_CANDLE_POOL: readonly EnrichedCandle<UTCTimestamp>[] = buildStaticEnrichedCandlePool();
