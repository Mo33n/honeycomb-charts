/**
 * Browser ESM harness (no bundler). Served from the local static server in `run-footprint-e2e.ts`.
 */
import { createChart } from '/lwc.mjs';
import { HoneycombSeries, defaultHoneycombSeriesOptions, applyFootprintLevelPatch } from '/hc/index.js';

const el = document.getElementById('chart');
if (!el) {
	throw new Error('missing #chart');
}

const chart = createChart(el, {
	width: 640,
	height: 400,
	layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
});

const series = chart.addCustomSeries(new HoneycombSeries(), {
	...defaultHoneycombSeriesOptions,
	priceLineVisible: false,
});

const INITIAL_HARNESS_DATA = [
	{
		time: 1700000000,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		levels: [
			{ price: 100, values: { bid: 50, ask: 30, delta: 20 } },
			{ price: 101, values: { bid: 10, ask: 40, delta: -30 } },
		],
	},
	{
		time: 1700003600,
		open: 101,
		high: 103,
		low: 100,
		close: 102,
		levels: [{ price: 101, values: { bid: 20, ask: 20, delta: 0 } }],
	},
];

series.setData(INITIAL_HARNESS_DATA);

chart.timeScale().fitContent();

/** Last custom `objectId` from crosshair (T-102 hover smoke). */
window.__hcLastHoverObjectId = undefined;
chart.subscribeCrosshairMove(param => {
	const id = param.hoveredInfo?.objectId ?? param.hoveredObjectId;
	window.__hcLastHoverObjectId = typeof id === 'string' ? id : undefined;
});

window.__footprintHarness = { chart, series };

function oneBurstUpdate(i) {
	series.update({
		time: 1700003600,
		open: 101,
		high: 103,
		low: 100,
		close: 102 + i * 0.001,
		revision: i + 1,
		levels: [{ price: 101, values: { bid: 20 + i, ask: 20, delta: i } }],
	});
}

window.resetFootprintHarnessData = () => {
	series.setData(structuredClone(INITIAL_HARNESS_DATA));
	chart.timeScale().fitContent();
};

window.runBurstUpdates = () => {
	for (let i = 0; i < 120; i++) {
		oneBurstUpdate(i);
	}
};

/**
 * T-103: median wall time for 120× last-bar updates; second metric waits two rAF ticks after burst (paint-ish).
 */
window.runLastBarBurstPerf = async () => {
	const burstN = 120;
	const runs = 5;
	const median = arr => {
		const s = [...arr].sort((a, b) => a - b);
		const mid = Math.floor(s.length / 2);
		return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
	};
	const syncSamples = [];
	const paintSamples = [];
	window.resetFootprintHarnessData();
	for (let i = 0; i < burstN; i++) {
		oneBurstUpdate(i);
	}
	window.resetFootprintHarnessData();
	for (let run = 0; run < runs; run++) {
		window.resetFootprintHarnessData();
		const t0 = performance.now();
		for (let i = 0; i < burstN; i++) {
			oneBurstUpdate(i);
		}
		const t1 = performance.now();
		syncSamples.push(t1 - t0);
	}
	for (let run = 0; run < runs; run++) {
		window.resetFootprintHarnessData();
		const t0 = performance.now();
		for (let i = 0; i < burstN; i++) {
			oneBurstUpdate(i);
		}
		await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
		const t1 = performance.now();
		paintSamples.push(t1 - t0);
	}
	return {
		lastBarBurstUpdate120MsMedian: median(syncSamples),
		lastBarBurstUpdate120MsSamples: syncSamples,
		lastBarBurst120Plus2RafMsMedian: median(paintSamples),
		lastBarBurst120Plus2RafMsSamples: paintSamples,
		lastBarBurstUpdateCount: burstN,
		lastBarBurstMedianRuns: runs,
	};
};

/** retainGap-style: whitespace logical slot then next bar (RFC §5.2 host contract smoke). */
window.runRetainGapSeries = () => {
	series.setData([
		{ time: 1700000000 },
		{
			time: 1700000600,
			open: 50,
			high: 51,
			low: 49,
			close: 50.5,
			levels: [{ price: 50, values: { bid: 1, ask: 1, delta: 0 } }],
		},
	]);
	chart.timeScale().fitContent();
};

/**
 * T-102: whitespace slot horizontal span should match adjacent real-bar span (same logical spacing).
 * Uses three points: whitespace + two candles 600s apart (same cadence as `runRetainGapSeries` gap).
 */
window.measureRetainGapSlotWidths = () => {
	series.setData([
		{ time: 1700000000 },
		{
			time: 1700000600,
			open: 50,
			high: 51,
			low: 49,
			close: 50.5,
			levels: [{ price: 50, values: { bid: 1, ask: 1, delta: 0 } }],
		},
		{
			time: 1700001200,
			open: 51,
			high: 52,
			low: 50,
			close: 51.5,
			levels: [{ price: 51, values: { bid: 2, ask: 1, delta: 1 } }],
		},
	]);
	chart.timeScale().fitContent();
	const ts = chart.timeScale();
	const idx = t => ts.timeToIndex(t, true);
	const coord = i => ts.logicalToCoordinate(i);
	const i0 = idx(1700000000);
	const i1 = idx(1700000600);
	const i2 = idx(1700001200);
	if (i0 === null || i1 === null || i2 === null) {
		return { error: 'timeToIndex returned null', i0, i1, i2 };
	}
	const x0 = coord(i0);
	const x1 = coord(i1);
	const x2 = coord(i2);
	if (x0 === null || x1 === null || x2 === null) {
		return { error: 'logicalToCoordinate returned null', x0, x1, x2 };
	}
	return {
		pxWhitespaceToFirst: Math.abs(x1 - x0),
		pxFirstToSecond: Math.abs(x2 - x1),
		logicalStep01: i1 - i0,
		logicalStep12: i2 - i1,
	};
};

/** HC1-013: partial row patch → second bar bid becomes 999 (crosshair data path). */
window.runApplyLevelPatchSmoke = () => {
	applyFootprintLevelPatch(series, { time: 1700003600, price: 101, values: { bid: 999 } });
	const bars = series.data();
	for (let i = 0; i < bars.length; i++) {
		const b = bars[i];
		if (typeof b !== 'object' || b === null || !('open' in b)) {
			continue;
		}
		if (b.time !== 1700003600) {
			continue;
		}
		const lvl = b.levels.find(r => r.price === 101);
		return lvl !== undefined ? lvl.values.bid : null;
	}
	return null;
};

window.__TEST_READY = true;
