/**
 * Static PNG harness: `?scenario=` selects layout / candle chrome (T-032 / T-033).
 * Scenarios: `default` | `barColumn` | `candleOff` | `zOutline` | `ruleColors` | `lodFloor` | `footprintCellBand` | `footprintOverlayStack` | `footprintOverlayOpacityEdge`
 */
import { createChart } from '/lwc.mjs';
import { HoneycombSeries, defaultHoneycombSeriesOptions } from '/hc/index.js';

const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario') ?? 'default';

const INITIAL = [
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

function buildLodDenseLevels() {
	const levels = [];
	for (let p = 100; p < 140; p += 1) {
		levels.push({ price: p, values: { bid: 2, ask: 2, delta: 0 } });
	}
	return levels;
}

const LOD_INITIAL = [
	{
		time: 1700000000,
		open: 100,
		high: 140,
		low: 100,
		close: 110,
		levels: buildLodDenseLevels(),
	},
];

const scenarios = {
	default: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
	}),
	barColumn: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
		left: {
			columns: [
				{ metricId: 'bid', kind: 'bar', visible: true, weight: 1 },
				{ metricId: 'ask', kind: 'bar', visible: true, weight: 1 },
			],
		},
		right: {
			columns: [{ metricId: 'delta', kind: 'bar', visible: true, weight: 1 }],
		},
	}),
	candleOff: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
		bodyVisible: false,
		wicksVisible: false,
	}),
	zOutline: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
		candleZOrder: 'outlineFront',
	}),
	ruleColors: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
		right: {
			columns: [
				{
					metricId: 'delta',
					kind: 'number',
					visible: true,
					weight: 1,
					colorRules: [
						{ when: { op: 'cmp', metric: 'delta', cmp: 'gt', value: 0 }, style: { textColor: '#66bb6a' } },
						{ when: { op: 'cmp', metric: 'delta', cmp: 'lt', value: 0 }, style: { textColor: '#ef5350' } },
						{ when: { op: 'literal', value: true }, style: { textColor: '#d1d4dc' } },
					],
				},
			],
		},
	}),
	lodFloor: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
		minFontPx: 11,
		maxFontPx: 13,
		lodOmitNumberGlyphs: true,
		bodyVisible: false,
		wicksVisible: false,
	}),
	/** ADR-0005 `cellBand` on classic footprint column (P2-A). */
	footprintCellBand: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
		left: {
			columns: [
				{
					metricId: 'bid',
					kind: 'number',
					visible: true,
					weight: 1,
					cellOverlays: [{ id: 'tint', kind: 'cellBand', fill: 'rgba(0, 120, 255, 0.28)', zOrder: 0 }],
				},
				{ metricId: 'ask', kind: 'number', visible: true, weight: 1 },
			],
		},
	}),
	/** PRD gallery: stacked overlays on one footprint cell (`zOrder` ascending). */
	footprintOverlayStack: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
		left: {
			columns: [
				{
					metricId: 'bid',
					kind: 'number',
					visible: true,
					weight: 1,
					cellOverlays: [
						{ id: 'base', kind: 'cellBand', fill: 'rgba(0, 120, 255, 0.18)', zOrder: 0 },
						{ id: 'mid', kind: 'cellBand', fill: 'rgba(255, 193, 7, 0.22)', zOrder: 10 },
						{ id: 'top', kind: 'cellBand', fill: 'rgba(244, 67, 54, 0.16)', zOrder: 20 },
					],
				},
				{ metricId: 'ask', kind: 'number', visible: true, weight: 1 },
			],
		},
	}),
	/** Edge case: zero / near-zero opacity overlays should be stable in paint order. */
	footprintOverlayOpacityEdge: () => ({
		...defaultHoneycombSeriesOptions,
		priceLineVisible: false,
		left: {
			columns: [
				{
					metricId: 'bid',
					kind: 'number',
					visible: true,
					weight: 1,
					cellOverlays: [
						{ id: 'invisible', kind: 'cellBand', fill: 'rgba(255, 0, 0, 1)', opacity: 0, zOrder: 0 },
						{ id: 'near_zero', kind: 'cellBand', fill: 'rgba(255, 255, 255, 1)', opacity: 0.02, zOrder: 5 },
						{ id: 'visible', kind: 'cellBand', fill: 'rgba(33, 150, 243, 0.25)', zOrder: 10 },
					],
				},
				{ metricId: 'ask', kind: 'number', visible: true, weight: 1 },
			],
		},
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

const series = chart.addCustomSeries(new HoneycombSeries(), factory());
series.setData(scenario === 'lodFloor' ? LOD_INITIAL : INITIAL);
chart.timeScale().fitContent();

window.__TEST_READY = true;
