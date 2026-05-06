import { createChart } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';

import {
	defaultHoneycombSeriesOptions,
	filterBarsByFootprintBrush,
	HoneycombSeries,
	runFootprintBrushReducers,
} from 'honeycomb-charts';

const t0 = 1_710_000_000 as UTCTimestamp;
const t1 = 1_710_008_640 as UTCTimestamp;
const t2 = 1_710_017_280 as UTCTimestamp;

const allBars = [
	{
		time: t0,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		levels: [
			{ price: 100, values: { bid: 10, ask: 5, delta: 5 } },
			{ price: 101, values: { bid: 2, ask: 8, delta: -6 } },
		],
	},
	{
		time: t1,
		open: 101,
		high: 101,
		low: 101,
		close: 101,
		levels: [] as const,
	},
	{
		time: t2,
		open: 101,
		high: 103,
		low: 100,
		close: 102,
		levels: [{ price: 101, values: { bid: 40, ask: 10, delta: 30, volume: 99 } }],
	},
] as const;

const chartEl = document.getElementById('chart');
const outEl = document.getElementById('out');
if (!chartEl || !outEl) {
	throw new Error('#chart / #out missing');
}

const chart = createChart(chartEl, {
	autoSize: true,
	layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
});

const series = chart.addCustomSeries(new HoneycombSeries(), {
	...defaultHoneycombSeriesOptions,
	priceLineVisible: false,
});

series.setData([...allBars]);
chart.timeScale().fitContent();

const leftSegment = defaultHoneycombSeriesOptions.left;

function applyBrush(label: string, from: UTCTimestamp, to: UTCTimestamp): void {
	const interval = { from, to };
	const subset = filterBarsByFootprintBrush([...allBars], interval);
	const results = runFootprintBrushReducers(subset, ['sum', 'rowCount', 'deltaSum', 'volumeSum'], {
		leftSegment,
		targetMetricId: 'bid',
	});
	outEl.textContent = JSON.stringify(
		{
			label,
			interval,
			barTimesInBrush: subset.map(b => b.time),
			results,
		},
		null,
		2
	);
}

document.getElementById('panel')?.addEventListener('click', ev => {
	const t = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-brush]');
	if (!t) {
		return;
	}
	const mode = t.dataset.brush;
	if (mode === 'single') {
		applyBrush('single bar', t0, t0);
	} else if (mode === 'two') {
		applyBrush('two bars', t0, t1);
	} else if (mode === 'whitespace') {
		applyBrush('includes empty-levels bar', t0, t2);
	}
});

applyBrush('default: single bar', t0, t0);
