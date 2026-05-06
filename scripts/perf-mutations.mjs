#!/usr/bin/env node
/**
 * CT-U05: relative perf harness for `applyMutationToSeries` (50 bars × 15 ops, `update` mode).
 * Usage:
 *   node ./scripts/perf-mutations.mjs
 *   node ./scripts/perf-mutations.mjs --check     # fail if p95 regresses vs baseline (see SLACK)
 *   node ./scripts/perf-mutations.mjs --write-baseline
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { applyMutationToSeries } from '../lib/chart-binding.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'perf-mutations.baseline.json');

/**
 * @param {number[]} sorted ascending
 * @param {number} p 0–100
 */
function percentile(sorted, p) {
	if (sorted.length === 0) {
		return NaN;
	}
	const pos = (p / 100) * (sorted.length - 1);
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) {
		return sorted[lo];
	}
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function makeBar(t) {
	return {
		time: t,
		open: 100,
		high: 101,
		low: 99,
		close: 100,
		levels: [{ price: 100, values: { bid: 1, ask: 1, delta: 0 } }],
	};
}

/**
 * @param {'update' | 'setData'} mode
 */
function runOnce(mode) {
	const bars = Array.from({ length: 50 }, (_, i) => makeBar(50_000 + i));
	let bcopy = structuredClone(bars);
	const series = {
		data: () => bcopy,
		update(bar) {
			const i = bcopy.findIndex(b => b.time === bar.time);
			if (i >= 0) {
				bcopy[i] = bar;
			}
		},
		setData(next) {
			bcopy = next.slice();
		},
	};
	const ctx = mode === 'setData' ? { mode: 'setData' } : {};
	for (let b = 0; b < 50; b++) {
		const candleId = 50_000 + b;
		for (let k = 0; k < 15; k++) {
			applyMutationToSeries(series, candleId, { ops: [{ op: 'add', path: 'levels.0.values.delta', delta: 1 }] }, ctx);
		}
	}
	for (let b = 0; b < 50; b++) {
		if (bcopy[b].levels[0].values.delta !== 15) {
			throw new Error(`integrity check failed at bar ${b}`);
		}
	}
}

const iterations = Math.max(20, parseInt(process.env.PERF_ITERATIONS || '150', 10));
const mode = process.env.PERF_MODE === 'setData' ? 'setData' : 'update';

const samples = [];
for (let r = 0; r < iterations; r++) {
	const t0 = performance.now();
	runOnce(mode);
	samples.push(performance.now() - t0);
}
samples.sort((a, b) => a - b);

const report = {
	version: 1,
	scenario: mode === 'setData' ? '50x15_applyMutationToSeries_setData' : '50x15_applyMutationToSeries_update',
	iterations,
	mode,
	p50_ms: Math.round(percentile(samples, 50) * 1000) / 1000,
	p95_ms: Math.round(percentile(samples, 95) * 1000) / 1000,
	max_ms: Math.round(samples[samples.length - 1] * 1000) / 1000,
	node: process.version,
};

// eslint-disable-next-line no-console
console.log(JSON.stringify(report, null, 2));

/** Multiplier on committed `p95_ms` before failing `--check` (VM variance). */
const SLACK = 2.5;

if (process.argv.includes('--check')) {
	const raw = await readFile(BASELINE_PATH, 'utf8');
	const baseline = JSON.parse(raw);
	if (typeof baseline.p95_ms !== 'number') {
		throw new Error('baseline missing p95_ms');
	}
	if (baseline.scenario && baseline.scenario !== report.scenario) {
		throw new Error(`baseline scenario mismatch: ${baseline.scenario} vs ${report.scenario}`);
	}
	if (report.p95_ms > baseline.p95_ms * SLACK) {
		// eslint-disable-next-line no-console
		console.error(`FAIL: p95 ${report.p95_ms}ms > baseline ${baseline.p95_ms}ms × ${SLACK}`);
		process.exit(1);
	}
}

if (process.argv.includes('--write-baseline')) {
	const toStore = {
		version: report.version,
		scenario: report.scenario,
		p95_ms: report.p95_ms,
		p50_ms: report.p50_ms,
		note: 'Trim slack in perf-mutations.mjs SLACK if machines stabilize.',
	};
	await writeFile(BASELINE_PATH, `${JSON.stringify(toStore, null, 2)}\n`, 'utf8');
	// eslint-disable-next-line no-console
	console.error(`Wrote ${BASELINE_PATH}`);
}
