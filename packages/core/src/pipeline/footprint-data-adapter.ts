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
	/** Invoked when the tick queue exceeds {@link maxQueuedTicks} and the oldest tick is evicted. */
	readonly onTickDropped?: (tick: FootprintTickLike, reason: 'queue_overflow') => void;
}

const DEFAULT_MAX_UPS = 60;
const DEFAULT_MAX_QUEUE = 50_000;

/** Default 1-minute bar key for Lightweight Charts `UTCTimestamp` (seconds). */
export const defaultFootprintBarKeySeconds: FootprintBarKeyFn = t => Math.floor(t.time / 60) * 60;

function clampMaxUps(value: number | undefined): number {
	const n = value ?? DEFAULT_MAX_UPS;
	if (!Number.isFinite(n) || n < 1) {
		return DEFAULT_MAX_UPS;
	}
	return n;
}

export class FootprintDataAdapter implements IFootprintDataAdapter {
	private readonly _opts: Required<Pick<FootprintDataAdapterOptions, 'maxUpdatesPerSecond' | 'maxQueuedTicks'>> & {
		readonly barKey: FootprintBarKeyFn;
		readonly now: () => number;
		readonly onTickDropped: ((tick: FootprintTickLike, reason: 'queue_overflow') => void) | undefined;
	};
	private _queue: FootprintTickLike[] = [];
	/** Buckets awaiting sink when token budget is exhausted (preserved across flushes). */
	private _pendingBuckets = new Map<number, FootprintTickLike[]>();
	private _tokens: number;
	private _lastRefillMs: number;

	public constructor(opts?: FootprintDataAdapterOptions) {
		const now =
			opts?.now ??
			((): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
		const maxUps = clampMaxUps(opts?.maxUpdatesPerSecond);
		this._opts = {
			maxUpdatesPerSecond: maxUps,
			maxQueuedTicks: opts?.maxQueuedTicks ?? DEFAULT_MAX_QUEUE,
			barKey: opts?.barKey ?? defaultFootprintBarKeySeconds,
			now,
			onTickDropped: opts?.onTickDropped,
		};
		this._tokens = maxUps;
		this._lastRefillMs = this._opts.now();
	}

	public pushTick(tick: FootprintTickLike): void {
		if (this._queue.length >= this._opts.maxQueuedTicks) {
			const dropped = this._queue.shift();
			if (dropped !== undefined) {
				this._opts.onTickDropped?.(dropped, 'queue_overflow');
			}
		}
		this._queue.push(tick);
	}

	public destroy(): void {
		this._queue = [];
		this._pendingBuckets.clear();
	}

	/** Pending bucket count (tests / diagnostics). */
	public pendingBucketCount(): number {
		return this._pendingBuckets.size;
	}

	/**
	 * Drain queued ticks into aggregated buckets; invoke `sink` at most `maxUpdatesPerSecond` times per real second.
	 * Unsunk buckets are retained for subsequent flushes.
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

		if (this._queue.length > 0) {
			for (const t of this._queue) {
				const k = this._opts.barKey(t);
				const arr = this._pendingBuckets.get(k);
				if (arr === undefined) {
					this._pendingBuckets.set(k, [t]);
				} else {
					arr.push(t);
				}
			}
			this._queue = [];
		}

		if (this._tokens < 1 || this._pendingBuckets.size === 0) {
			return;
		}

		const keys = [...this._pendingBuckets.keys()].sort((a, b) => a - b);
		for (const k of keys) {
			if (this._tokens < 1) {
				break;
			}
			const ticks = this._pendingBuckets.get(k);
			if (ticks === undefined || ticks.length === 0) {
				this._pendingBuckets.delete(k);
				continue;
			}
			this._pendingBuckets.delete(k);
			this._tokens -= 1;
			sink(k, ticks);
		}
	}
}
