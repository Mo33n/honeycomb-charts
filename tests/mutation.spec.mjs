import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CompileLayoutError } from '../lib/errors.mjs';
import { applyMutationBatch, applyOpsToBar } from '../lib/mutation.mjs';
import { DEFAULT_MAX_PATH_DEPTH } from '../lib/path-parser.mjs';

describe('applyOpsToBar (RFC-0002 §6)', () => {
	it('P1: set twice same path is idempotent', () => {
		const bar = { close: 1 };
		const once = applyOpsToBar(bar, [{ op: 'set', path: 'close', value: 9 }]);
		const twice = applyOpsToBar(once, [{ op: 'set', path: 'close', value: 9 }]);
		assert.equal(twice.close, 9);
		assert.notEqual(once, bar);
	});

	it('P3: path with .. rejected at parse', () => {
		assert.throws(
			() => applyOpsToBar({ a: 1 }, [{ op: 'set', path: 'a..b', value: 1 }]),
			(e) => e instanceof CompileLayoutError && e.code === 'PATH_REJECTED'
		);
	});

	it('P4: path depth beyond default fails', () => {
		const segs = Array.from({ length: DEFAULT_MAX_PATH_DEPTH + 1 }, () => 'x').join('.');
		assert.throws(
			() => applyOpsToBar({ x: 1 }, [{ op: 'set', path: segs, value: 1 }]),
			(e) => e instanceof CompileLayoutError && e.code === 'PATH_TOO_DEEP'
		);
	});

	it('P5: set on missing intermediate throws PATH_NOT_FOUND', () => {
		assert.throws(
			() => applyOpsToBar({ footprint_levels: [] }, [{ op: 'set', path: 'footprint_levels.0.buy_qty', value: 1 }]),
			(e) => e instanceof CompileLayoutError && e.code === 'PATH_NOT_FOUND'
		);
	});

	it('applies set and add on nested structure', () => {
		const bar = {
			footprint_levels: [{ buy_qty: 1, sell_qty: 2 }],
		};
		const out = applyOpsToBar(bar, [
			{ op: 'add', path: 'footprint_levels.0.buy_qty', delta: 5 },
			{ op: 'set', path: 'footprint_levels.0.sell_qty', value: 0 },
		]);
		assert.equal(out.footprint_levels[0].buy_qty, 6);
		assert.equal(out.footprint_levels[0].sell_qty, 0);
	});

	it('add treats missing numeric leaf as 0', () => {
		const bar = { footprint_levels: [{}] };
		const out = applyOpsToBar(bar, [{ op: 'add', path: 'footprint_levels.0.buy_qty', delta: 3 }]);
		assert.equal(out.footprint_levels[0].buy_qty, 3);
	});
});

describe('applyMutationBatch revision (RFC-0002 §6 P2)', () => {
	it('P2: second batch with same revision is no-op', () => {
		const bar = { v: 0 };
		const revMap = new Map();
		const b1 = applyMutationBatch(bar, { candleId: 'c1', revision: 5, ops: [{ op: 'add', path: 'v', delta: 100 }] }, { lastRevisionByCandleId: revMap });
		assert.equal(b1.applied, true);
		assert.equal(b1.bar.v, 100);
		const b2 = applyMutationBatch(b1.bar, { candleId: 'c1', revision: 5, ops: [{ op: 'add', path: 'v', delta: 100 }] }, { lastRevisionByCandleId: revMap });
		assert.equal(b2.applied, false);
		assert.equal(b2.reason, 'stale_revision');
		assert.equal(b2.bar.v, 100);
	});

	it('strictRevision requires map when revision is set', () => {
		assert.throws(
			() =>
				applyMutationBatch(
					{ x: 0 },
					{ candleId: 'a', revision: 1, ops: [{ op: 'add', path: 'x', delta: 1 }] },
					{ strictRevision: true }
				),
			e => e instanceof CompileLayoutError && e.code === 'MUTATION_INVALID_VALUE'
		);
	});

	it('allows monotonic increasing revision', () => {
		const revMap = new Map();
		let cur = { x: 0 };
		cur = applyMutationBatch(cur, { candleId: 1, revision: 1, ops: [{ op: 'add', path: 'x', delta: 1 }] }, { lastRevisionByCandleId: revMap }).bar;
		cur = applyMutationBatch(cur, { candleId: 1, revision: 2, ops: [{ op: 'add', path: 'x', delta: 1 }] }, { lastRevisionByCandleId: revMap }).bar;
		assert.equal(cur.x, 2);
	});
});
