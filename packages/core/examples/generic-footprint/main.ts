import { createChart } from 'lightweight-charts';

import {
	defaultGenericFootprintSeriesOptions,
	GenericFootprintSeries,
	mergeGenericFootprintSeriesOptions,
	type GenericFootprintSlot,
} from 'honeycomb-charts';

import { buildGenericFootprintSampleData } from './sample-candles.js';

const el = document.getElementById('chart');
if (el === null) {
	throw new Error('#chart missing');
}

/** Reference-style footprint: Δ (sign) | vol (cell bg) | Δ histogram (sign colors) + bar summaries + mini OHLC. */
const referenceSlots: readonly GenericFootprintSlot[] = [
	{ role: 'number', metricId: 'delta', colorBySign: true },
	{ role: 'number', metricId: 'vol', cellBackground: 'rgba(42, 42, 48, 0.94)' },
	{ role: 'histogram', metricId: 'delta', grow: 'right', colorizeBySign: true },
];

const chart = createChart(el, {
	autoSize: true,
	layout: { background: { color: '#000000' }, textColor: '#d1d4dc' },
	rightPriceScale: { borderVisible: false },
	timeScale: { borderVisible: false },
	grid: { vertLines: { visible: false }, horzLines: { visible: false } },
});

const series = chart.addCustomSeries(
	new GenericFootprintSeries(),
	mergeGenericFootprintSeriesOptions(defaultGenericFootprintSeriesOptions, {
		color: 'rgba(0,0,0,0)',
		lineWidth: 0,
		slots: referenceSlots,
		slotWeights: [1, 1.12, 1.22],
		candleStripFraction: 0.1,
		showPriceGrid: false,
		histogramShowValues: true,
		pocMetricId: 'vol',
		barHeaderLines: [{ metricId: 'delta', colorBySign: true }],
		barFooterLines: [
			{ metricId: 'delta', colorBySign: true },
			{ metricId: 'vol', colorBySign: false },
		],
		barSummaryLabelGapCss: 5,
		barSummaryLineHeightCss: 11,
		theme: {
			gridColor: 'rgba(255,255,255,0.06)',
			cellSeparator: 'rgba(0, 0, 0, 0.35)',
			candleLaneBg: 'rgba(28, 28, 32, 0.95)',
			candleLaneEdge: 'rgba(255,255,255,0.1)',
		},
	})
);

series.setData(buildGenericFootprintSampleData());
chart.timeScale().fitContent();

const meta = document.getElementById('meta');
if (meta !== null) {
	meta.textContent =
		'GenericFootprintSeries — reference-style layout: Δ | vol | Δ histogram (sign), POC on vol, header/footer sums, 24 bars. npm run examples:dev:generic-footprint';
}
