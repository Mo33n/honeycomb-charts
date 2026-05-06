import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FootprintDataAdapter } from '../src/pipeline/footprint-data-adapter.js';

describe('FootprintDataAdapter', () => {
	it('buckets ticks and respects token budget', () => {
		const a = new FootprintDataAdapter({ maxUpdatesPerSecond: 2, barKey: t => t.time });
		a.pushTick({ time: 1, price: 10 });
		a.pushTick({ time: 1, price: 11 });
		a.pushTick({ time: 2, price: 12 });
		const sinks: number[] = [];
		a.flushAggregated((k, ticks) => {
			sinks.push(k);
			assert.ok(ticks.length >= 1);
		});
		assert.ok(sinks.length <= 2);
	});
});
