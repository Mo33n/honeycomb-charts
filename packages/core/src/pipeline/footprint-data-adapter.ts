/**
 * Optional tick → enriched-candle adapter with a 60 Hz sustained cap (RFC §5.8, PM Q20).
 * Call {@link FootprintDataAdapter.flushAggregated} from `requestAnimationFrame` or your chart update loop.
 */

import type { IFootprintDataAdapter } from './footprint-adapter-contract.js';
import type { FootprintBarKeyFn, FootprintTickLike } from './footprint-tick.js';

export type { FootprintBarKeyFn, FootprintTickLike } from './footprint-tick.js';

export interface FootprintDataAdapterOptions {
	readonly maxUpdatesPerSecond?: number;
	readonly maxQueuedTicks?: number;
	readonly barKey?: FootprintBarKeyFn;
	/** Monotonic clock (ms). Inject in tests to control token-bucket refills. */
	readonly now?: () => number;
}

const DEFAULT_MAX_UPS = 60;
const DEFAULT_MAX_QUEUE = 50_000;

export class FootprintDataAdapter implements IFootprintDataAdapter {
	private readonly _opts: Required<Pick<FootprintDataAdapterOptions, 'maxUpdatesPerSecond' | 'maxQueuedTicks'>> & {
		readonly barKey: FootprintBarKeyFn;
		readonly now: () => number;
	};
	private _queue: FootprintTickLike[] = [];
	private _tokens: number;
	private _lastRefillMs: number;

	public constructor(opts?: FootprintDataAdapterOptions) {
		const now =
			opts?.now ??
			((): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
		this._opts = {
			maxUpdatesPerSecond: opts?.maxUpdatesPerSecond ?? DEFAULT_MAX_UPS,
			maxQueuedTicks: opts?.maxQueuedTicks ?? DEFAULT_MAX_QUEUE,
			barKey: opts?.barKey ?? (t => Math.floor(t.time / 60_000) * 60_000),
			now,
		};
		this._tokens = this._opts.maxUpdatesPerSecond;
		this._lastRefillMs = this._opts.now();
	}

	public pushTick(tick: FootprintTickLike): void {
		if (this._queue.length >= this._opts.maxQueuedTicks) {
			this._queue.shift();
		}
		this._queue.push(tick);
	}

	public destroy(): void {
		this._queue = [];
	}

	/**
	 * Drain queued ticks into aggregated buckets; invoke `sink` at most `maxUpdatesPerSecond` times per real second.
	 */
	public flushAggregated(sink: (bucketTime: number, ticks: readonly FootprintTickLike[]) => void): void {
		const now = this._opts.now();
		const elapsed = (now - this._lastRefillMs) / 1000;
		if (elapsed > 0) {
			this._tokens = Math.min(
				this._opts.maxUpdatesPerSecond,
				this._tokens + elapsed * this._opts.maxUpdatesPerSecond
			);
			this._lastRefillMs = now;
		}
		if (this._tokens < 1 || this._queue.length === 0) {
			return;
		}

		const buckets = new Map<number, FootprintTickLike[]>();
		for (const t of this._queue) {
			const k = this._opts.barKey(t);
			const arr = buckets.get(k);
			if (arr === undefined) {
				buckets.set(k, [t]);
			} else {
				arr.push(t);
			}
		}
		this._queue = [];

		for (const [k, ticks] of buckets) {
			if (this._tokens < 1) {
				break;
			}
			this._tokens -= 1;
			sink(k, ticks);
		}
	}
}
