#!/usr/bin/env node
/**
 * CT-P1-10: stress `applyOpsToBar` / `applyMutationBatch` (no DOM). Used locally or in CI optional job.
 * Exits non-zero if wall time exceeds budget (default 30s).
 */
import { performance } from 'node:perf_hooks';

import { applyMutationBatch, applyOpsToBar } from '../lib/mutation.mjs';

const budgetMs = parseInt(process.env.LOADTEST_BUDGET_MS || '30000', 10);
const outer = parseInt(process.env.LOADTEST_OUTER || '8000', 10);
const inner = parseInt(process.env.LOADTEST_INNER || '20', 10);

const t0 = performance.now();
const rev = new Map();
for (let i = 0; i < outer; i++) {
	let bar = {
		time: i,
		open: 1,
		high: 1,
		low: 1,
		close: 1,
		levels: [{ price: 1, values: { delta: 0 } }],
	};
	for (let j = 0; j < inner; j++) {
		bar = applyOpsToBar(bar, [{ op: 'add', path: 'levels.0.values.delta', delta: 1 }]);
	}
	if (bar.levels[0].values.delta !== inner) {
		throw new Error(`integrity failed outer=${i}`);
	}
	const out = applyMutationBatch(
		bar,
		{ candleId: i, revision: inner, ops: [{ op: 'set', path: 'close', value: 2 }] },
		{ lastRevisionByCandleId: rev }
	);
	if (!out.applied) {
		throw new Error('unexpected stale revision');
	}
}
const elapsed = performance.now() - t0;
// eslint-disable-next-line no-console
console.log(JSON.stringify({ outer, inner, ops: outer * inner + outer, elapsed_ms: Math.round(elapsed * 100) / 100, budget_ms: budgetMs }, null, 2));
if (elapsed > budgetMs) {
	// eslint-disable-next-line no-console
	console.error(`FAIL: exceeded budget ${budgetMs}ms`);
	process.exit(1);
}
