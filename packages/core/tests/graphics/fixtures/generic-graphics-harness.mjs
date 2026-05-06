/**
 * GenericFootprintSeries PNG harness for heatmapCell baselines (`?scenario=`).
 */
import { createChart } from '/lwc.mjs';
import { defaultGenericFootprintSeriesOptions, GenericFootprintSeries } from '/hc/index.js';

const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario') ?? 'genericHeatSequential';

const BARS = [
	{
		time: 1700000000,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		levels: [
			{ price: 100, values: { vol: 120, delta: 25, sec: 0.4 } },
			{ price: 101, values: { vol: 15, delta: -35, sec: -0.7 } },
		],
	},
	{
		time: 1700003600,
		open: 101,
		high: 103,
		low: 100,
		close: 102,
		levels: [{ price: 101, values: { vol: 40, delta: 5, sec: 0.1 } }],
	},
];

const base = () => ({
	...defaultGenericFootprintSeriesOptions,
	candleStripFraction: 0.12,
	showPriceGrid: false,
	histogramShowValues: false,
});

const scenarios = {
	genericHeatSequential: () => ({
		...base(),
		slots: [
			{ role: 'heatmapCell', metricId: 'vol', colorMode: 'sequential' },
			{ role: 'number', metricId: 'delta', colorBySign: true },
		],
		slotWeights: [1.25, 1],
	}),
	genericHeatDiverging: () => ({
		...base(),
		slots: [{ role: 'heatmapCell', metricId: 'delta', colorMode: 'diverging' }],
		slotWeights: [1],
	}),
	genericHeatValueSecondary: () => ({
		...base(),
		slots: [{ role: 'heatmapCell', metricId: 'vol', colorMode: 'valueSecondary', secondaryMetricId: 'sec' }],
		slotWeights: [1],
	}),
	/** ADR-0005 `cellBand` under glyphs (P2-A golden). */
	genericCellBand: () => ({
		...base(),
		slots: [{ role: 'number', metricId: 'delta', colorBySign: true }],
		slotWeights: [1],
		columnOverlays: [[{ id: 'tint', kind: 'cellBand', fill: 'rgba(0, 120, 255, 0.25)', zOrder: 0 }]],
	}),
	/** PRD gallery: stacked overlays on the same generic slot. */
	genericOverlayStack: () => ({
		...base(),
		slots: [{ role: 'number', metricId: 'delta', colorBySign: true }],
		slotWeights: [1],
		columnOverlays: [[
			{ id: 'base', kind: 'cellBand', fill: 'rgba(0, 120, 255, 0.2)', zOrder: 0 },
			{ id: 'mid', kind: 'cellBand', fill: 'rgba(255, 193, 7, 0.25)', zOrder: 10 },
			{ id: 'top', kind: 'cellBand', fill: 'rgba(76, 175, 80, 0.22)', zOrder: 20 },
		]],
	}),
	/** Edge case: mixed zero / tiny opacity in multi-overlay stack. */
	genericOverlayOpacityEdge: () => ({
		...base(),
		slots: [{ role: 'number', metricId: 'delta', colorBySign: true }],
		slotWeights: [1],
		columnOverlays: [[
			{ id: 'invisible', kind: 'cellBand', fill: 'rgba(255, 0, 0, 1)', opacity: 0, zOrder: 0 },
			{ id: 'near_zero', kind: 'cellBand', fill: 'rgba(255, 255, 255, 1)', opacity: 0.02, zOrder: 5 },
			{ id: 'visible', kind: 'cellBand', fill: 'rgba(0, 150, 136, 0.28)', zOrder: 10 },
		]],
	}),
	/** Dense-row stress snapshot for overlay stability across many levels. */
	genericOverlayDenseRows: () => ({
		...base(),
		slots: [{ role: 'number', metricId: 'delta', colorBySign: true }],
		slotWeights: [1],
		columnOverlays: [[{ id: 'dense', kind: 'cellBand', fill: 'rgba(63, 81, 181, 0.2)', zOrder: 0 }]],
		minCellHeightPx: 0.5,
	}),
	/** CT-P2-12 Tier-1: summary lines hidden when slot area is narrow. */
	genericSummaryLodHidden: () => ({
		...base(),
		slots: [{ role: 'number', metricId: 'delta', colorBySign: true }],
		slotWeights: [1],
		barHeaderLines: [{ metricId: 'delta', colorBySign: true }],
		barFooterLines: [{ metricId: 'vol', colorBySign: false }],
		lodSummaryMinSlotAreaPx: 1000,
	}),
	/** CT-P2-12 Tier-2: ratio slot hidden when slot area is narrow. */
	genericRatioLodHidden: () => ({
		...base(),
		slots: [
			{ role: 'histogram', metricId: 'vol', grow: 'left' },
			{ role: 'ratio', metricId: 'delta', ratioDenominatorId: 'vol' },
			{ role: 'number', metricId: 'delta', colorBySign: true },
		],
		slotWeights: [1, 1, 1],
		lodHideRatioMinSlotAreaPx: 1000,
	}),
	/** CT-P2-12 Tier-2 progressive: ratio + number slots hidden at deeper threshold. */
	genericProgressiveLodHidden: () => ({
		...base(),
		slots: [
			{ role: 'histogram', metricId: 'vol', grow: 'left' },
			{ role: 'ratio', metricId: 'delta', ratioDenominatorId: 'vol' },
			{ role: 'number', metricId: 'delta', colorBySign: true },
		],
		slotWeights: [1, 1, 1],
		lodHideRatioMinSlotAreaPx: 900,
		lodHideNumberMinSlotAreaPx: 1000,
	}),
};

const el = document.getElementById('chart');
if (!el) {
	throw new Error('missing #chart');
}

const factory = scenarios[scenario];
if (factory === undefined) {
	throw new Error(`unknown scenario: ${scenario}`);
}

const chart = createChart(el, {
	width: 640,
	height: 400,
	layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
});

const series = chart.addCustomSeries(new GenericFootprintSeries(), factory());
if (scenario === 'genericOverlayDenseRows') {
	const levels = [];
	for (let p = 90; p <= 120; p += 1) {
		levels.push({ price: p, values: { vol: 3 + (p % 5), delta: (p % 7) - 3, sec: 0.1 } });
	}
	series.setData([
		{
			time: 1700000000,
			open: 100,
			high: 121,
			low: 89,
			close: 101,
			levels,
		},
	]);
} else {
	series.setData(BARS);
}
chart.timeScale().fitContent();

window.__TEST_READY = true;
