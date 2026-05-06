import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

import { computeSegmentColumnWidths } from '../src/layout/segment-widths.js';
import { buildRowVerticalBands } from '../src/layout/row-geometry.js';
import type { EnrichedCandle, FootprintLevelRow } from '../src/schema/types.js';

const cols = [
	{ metricId: 'bid', kind: 'number' as const, visible: true, weight: 1 },
	{ metricId: 'ask', kind: 'number' as const, visible: true, weight: 1 },
	{ metricId: 'delta', kind: 'bar' as const, visible: true, weight: 1 },
];

const levels: FootprintLevelRow[] = [];
for (let i = 0; i < 256; i++) {
	levels.push({
		price: 98 + i * (6 / 255),
		values: { bid: i, ask: 255 - i, delta: i - (255 - i) },
	});
}

const candle: EnrichedCandle<number> = {
	time: 1 as unknown as number,
	open: 100,
	high: 104,
	low: 98,
	close: 102,
	levels,
};

function medianMsPerCall(samples: number[]): number {
	const s = [...samples].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median of `runs` outer timings, each divided by `iterations` (ms per inner call). */
function benchMedianPerInnerCall(fn: () => void, iterations: number, runs: number): { medianMsPerCall: number; samplesMsPerCall: number[] } {
	const samplesMsPerCall: number[] = [];
	for (let r = 0; r < runs; r++) {
		const t0 = performance.now();
		for (let i = 0; i < iterations; i++) {
			fn();
		}
		const t1 = performance.now();
		samplesMsPerCall.push((t1 - t0) / iterations);
	}
	return { medianMsPerCall: medianMsPerCall(samplesMsPerCall), samplesMsPerCall };
}

async function main(): Promise<void> {
	const iters = 200;
	const benchRuns = 5;
	const seg = benchMedianPerInnerCall(
		() => {
			computeSegmentColumnWidths({ slotWidthPx: 80, leftColumns: cols, rightColumns: [] });
		},
		iters,
		benchRuns
	);

	const rowIters = Math.min(50, iters);
	const row = benchMedianPerInnerCall(
		() => {
			buildRowVerticalBands(candle, candle.levels, p => p * 2);
		},
		rowIters,
		benchRuns
	);

	const out: Record<string, unknown> = {
		benchmark: 'footprint-layout-smoke',
		medianRuns: benchRuns,
		iterationsSegmentWidths: iters,
		iterationsRowBands: rowIters,
		msPerCallSegmentWidthsMedian: seg.medianMsPerCall,
		msPerCallRowBandsMedian: row.medianMsPerCall,
		msPerCallSegmentWidthsSamples: seg.samplesMsPerCall,
		msPerCallRowBandsSamples: row.samplesMsPerCall,
		generatedAt: new Date().toISOString(),
	};

	if (process.env['HC_SKIP_BROWSER_PERF'] === '1') {
		out.browserBenchSkipped = true;
		out.lastBarUpdateNote = 'Browser burst bench skipped (HC_SKIP_BROWSER_PERF=1).';
	} else {
		try {
			const { measureBrowserLastBarMetrics } = await import('./browser-last-bar-bench.js');
			const browser = await measureBrowserLastBarMetrics();
			Object.assign(out, browser);
			out.lastBarUpdateNote =
				'lastBarBurst*: headless Chrome, 120× update on last bar, 5 median runs. Plus-2-rAF includes two animation frames after burst (approximate paint scheduling).';
		} catch (e) {
			out.browserBenchError = String(e);
			out.lastBarUpdateNote = 'Browser burst bench failed; see browserBenchError. Set HC_SKIP_BROWSER_PERF=1 to emit layout-only JSON.';
		}
	}

	const json = JSON.stringify(out, null, 2);
	console.log(json);
	const outPath = process.env['HC_PERF_JSON_OUT'];
	if (outPath !== undefined && outPath.length > 0) {
		const dir = dirname(outPath);
		if (dir !== '.') {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(outPath, json, 'utf8');
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
