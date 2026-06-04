/**
 * Bounded per-frame application of {@link applyMutationToSeries} (CT-P1-12).
 * @module honeycomb/lib/mutation-scheduler
 */
import { applyMutationToSeries } from './chart-binding.mjs';

/**
 * @param {{
 *   maxOpsPerFrame?: number;
 *   requestAnimationFrame?: (cb: () => void) => unknown;
 * }} [options]
 */
function defaultRaf(cb) {
	if (typeof globalThis.requestAnimationFrame === 'function') {
		return globalThis.requestAnimationFrame(cb);
	}
	return /** @type {ReturnType<typeof setTimeout>} */ (setTimeout(cb, 0));
}

/**
 * Queues per-bar mutation batches and drains up to **`maxOpsPerFrame`** per animation frame (browser)
 * or timer fallback (Node).
 *
 * @param {{ get: () => unknown }} seriesHandle invoked each flush (supports `swapLayout`)
 * @param {Map<number | string, number>} lastRevisionByCandleId shared map (e.g. chart binding’s map)
 * @param {{ maxOpsPerFrame?: number; requestAnimationFrame?: (cb: () => void) => unknown }} [options]
 */
export function createMutationApplyScheduler(seriesHandle, lastRevisionByCandleId, options = {}) {
	const maxOpsPerFrame = options.maxOpsPerFrame ?? 64;
	const raf = options.requestAnimationFrame ?? defaultRaf;
	/** @type {Array<{ candleId: number | string; batch: { revision?: number; ops: readonly unknown[] }; ctx?: { strictRevision?: boolean; mode?: 'update' | 'setData' } }>} */
	const queue = [];
	let flushScheduled = false;
	let destroyed = false;

	function flush() {
		if (destroyed) {
			return;
		}
		flushScheduled = false;
		const series = seriesHandle.get();
		if (!series) {
			if (queue.length > 0) {
				flushScheduled = true;
				raf(flush);
			}
			return;
		}
		let used = 0;
		while (queue.length > 0 && used < maxOpsPerFrame) {
			const job = queue.shift();
			if (!job) {
				break;
			}
			try {
				applyMutationToSeries(series, job.candleId, job.batch, {
					...job.ctx,
					lastRevisionByCandleId,
				});
			} catch (err) {
				// Host may enqueue level patches before the series bar has matching levels[].
				console.warn('[Honeycomb] applyMutationToSeries failed', err);
			}
			used += 1;
		}
		if (queue.length > 0) {
			flushScheduled = true;
			raf(flush);
		}
	}

	function schedule() {
		if (flushScheduled || destroyed) {
			return;
		}
		flushScheduled = true;
		raf(flush);
	}

	return {
		/**
		 * @param {number | string} candleId
		 * @param {{ revision?: number; ops: readonly unknown[] }} batch
		 * @param {{ strictRevision?: boolean; mode?: 'update' | 'setData' }} [ctx]
		 */
		push(candleId, batch, ctx) {
			if (destroyed) {
				return;
			}
			queue.push({ candleId, batch, ctx });
			schedule();
		},
		/** @returns {number} queued jobs not yet flushed */
		pendingCount() {
			return queue.length;
		},
		/** Drops queued work (does not undo applied mutations). */
		clear() {
			queue.length = 0;
			flushScheduled = false;
		},
		/** Cancels pending flushes and rejects new pushes. */
		destroy() {
			destroyed = true;
			queue.length = 0;
			flushScheduled = false;
		},
	};
}

/**
 * Clears a mutation scheduler whenever the chart binding swaps layouts.
 *
 * @param {ReturnType<typeof createMutationApplyScheduler>} scheduler
 * @param {{ onLayoutSwap?: (listener: () => void) => () => void }} binding
 * @returns {() => void} unsubscribe
 */
export function bindMutationSchedulerToLayoutSwap(scheduler, binding) {
	if (typeof binding.onLayoutSwap !== 'function') {
		return () => {};
	}
	return binding.onLayoutSwap(() => scheduler.clear());
}
