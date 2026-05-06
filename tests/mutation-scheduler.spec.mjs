import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMutationApplyScheduler } from '../lib/mutation-scheduler.mjs';

describe('createMutationApplyScheduler', () => {
	it('drains queued mutations asynchronously', async () => {
		const rev = new Map();
		let bars = [{ time: 1, open: 1, high: 1, low: 1, close: 1, levels: [{ price: 1, values: { delta: 0 } }] }];
		const series = {
			data: () => bars,
			_last: /** @type {unknown} */ (null),
			update(bar) {
				this._last = bar;
				const i = bars.findIndex(b => b.time === bar.time);
				if (i >= 0) {
					bars[i] = bar;
				}
			},
		};
		const handle = { get: () => series };
		const sched = createMutationApplyScheduler(handle, rev, {
			maxOpsPerFrame: 2,
			requestAnimationFrame: cb => queueMicrotask(cb),
		});
		for (let i = 0; i < 5; i++) {
			sched.push(1, { ops: [{ op: 'add', path: 'levels.0.values.delta', delta: 1 }] });
		}
		for (let n = 0; n < 20 && sched.pendingCount() > 0; n++) {
			await new Promise(r => queueMicrotask(r));
		}
		assert.equal(sched.pendingCount(), 0);
		assert.equal(/** @type {{ levels: { values: { delta: number } }[] }} */ (series._last).levels[0].values.delta, 5);
	});
});
