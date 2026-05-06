import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FootprintDataAdapter } from '../src/pipeline/footprint-data-adapter.js';

describe('FootprintDataAdapter rate (T-071)', () => {
	it('caps sink invocations per flush using token bucket', () => {
		let tMs = 0;
		const adapter = new FootprintDataAdapter({
			maxUpdatesPerSecond: 5,
			now: () => tMs,
			barKey: tick => tick.time,
		});
		for (let i = 0; i < 20; i++) {
			adapter.pushTick({ time: i, price: 1 });
		}
		let calls = 0;
		adapter.flushAggregated(() => {
			calls += 1;
		});
		assert.equal(calls, 5);
		tMs += 1000;
		for (let i = 0; i < 20; i++) {
			adapter.pushTick({ time: 100 + i, price: 2 });
		}
		calls = 0;
		adapter.flushAggregated(() => {
			calls += 1;
		});
		assert.equal(calls, 5);
	});
});
