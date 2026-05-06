import type { FootprintTickLike } from './footprint-tick.js';

/**
 * Tick/trade ingestion contract (RFC §5.8 Path B). Hosts using only enriched `setData` may omit this.
 */
export interface IFootprintDataAdapter {
	pushTick(tick: FootprintTickLike): void;
	flushAggregated(sink: (bucketTime: number, ticks: readonly FootprintTickLike[]) => void): void;
	destroy(): void;
}

/** No-op adapter for type checks and Path A demos. */
export class NoopFootprintDataAdapter implements IFootprintDataAdapter {
	public pushTick(tick: FootprintTickLike): void {
		void tick;
	}

	public flushAggregated(sink: (bucketTime: number, ticks: readonly FootprintTickLike[]) => void): void {
		void sink;
	}

	public destroy(): void {
		// no timers
	}
}
