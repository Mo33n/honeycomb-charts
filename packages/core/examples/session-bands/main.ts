import { createChart } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';

import { HoneycombSeries, defaultHoneycombSeriesOptions } from 'honeycomb-charts';

const t0 = 1_710_000_000 as UTCTimestamp;
const t1 = 1_710_086_400 as UTCTimestamp;
const t2 = 1_710_172_800 as UTCTimestamp;
/** Example “session” window inside the data range (UTC seconds). */
const sessionFrom = 1_710_040_000 as UTCTimestamp;
const sessionTo = 1_710_130_000 as UTCTimestamp;

const chartEl = document.getElementById('chart');
const bandEl = document.getElementById('band');
const stage = document.getElementById('stage');
if (!chartEl || !bandEl || !stage) {
	throw new Error('#chart / #band / #stage missing');
}

const chart = createChart(chartEl, {
	autoSize: true,
	layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
});

const series = chart.addCustomSeries(new HoneycombSeries(), {
	...defaultHoneycombSeriesOptions,
	priceLineVisible: false,
});

series.setData([
	{
		time: t0,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		levels: [{ price: 100, values: { bid: 40, ask: 30, delta: 10 } }],
	},
	{
		time: t1,
		open: 101,
		high: 103,
		low: 100,
		close: 102,
		levels: [{ price: 101, values: { bid: 22, ask: 18, delta: 4 } }],
	},
	{
		time: t2,
		open: 102,
		high: 104,
		low: 101,
		close: 103,
		levels: [{ price: 102, values: { bid: 10, ask: 50, delta: -40 } }],
	},
]);

chart.timeScale().fitContent();

function positionBand(): void {
	const x1 = chart.timeScale().timeToCoordinate(sessionFrom);
	const x2 = chart.timeScale().timeToCoordinate(sessionTo);
	if (x1 === null || x2 === null) {
		bandEl.style.width = '0px';
		return;
	}
	const left = Math.min(x1, x2);
	const width = Math.abs(x2 - x1);
	bandEl.style.left = `${left}px`;
	bandEl.style.width = `${width}px`;
}

chart.timeScale().subscribeVisibleTimeRangeChange(() => {
	positionBand();
});

const ro = new ResizeObserver(() => {
	positionBand();
});
ro.observe(stage);

requestAnimationFrame(() => {
	positionBand();
});
