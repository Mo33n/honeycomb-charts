import { FootprintDataAdapter, type FootprintTickLike } from './footprint-data-adapter.js';

/**
 * RAF-driven coalescing loop around {@link FootprintDataAdapter.flushAggregated}.
 */
export class FootprintSeriesBinding {
	private readonly _adapter: FootprintDataAdapter;
	private _raf: number | null = null;
	private _flushLoopActive = false;

	public constructor(adapter?: FootprintDataAdapter) {
		this._adapter = adapter ?? new FootprintDataAdapter();
	}

	public get adapter(): FootprintDataAdapter {
		return this._adapter;
	}

	public startRafFlush(onBucket: (bucketTime: number, ticks: readonly FootprintTickLike[]) => void): void {
		if (typeof requestAnimationFrame === 'undefined' || this._flushLoopActive) {
			return;
		}
		this._flushLoopActive = true;
		const tick = (): void => {
			if (!this._flushLoopActive) {
				return;
			}
			this._adapter.flushAggregated(onBucket);
			this._raf = requestAnimationFrame(tick);
		};
		this._raf = requestAnimationFrame(tick);
	}

	public destroy(): void {
		this._flushLoopActive = false;
		if (this._raf !== null && typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(this._raf);
		}
		this._raf = null;
		this._adapter.destroy();
	}
}
