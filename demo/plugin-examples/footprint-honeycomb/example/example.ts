import { createChart, type UTCTimestamp } from 'lightweight-charts';
import { HoneycombSeries, defaultHoneycombSeriesOptions } from '@honeycomb/charts';

const chart = ((window as unknown as { chart: ReturnType<typeof createChart> }).chart = createChart('chart', {
	autoSize: true,
	layout: {
		background: { color: '#1a1a1a' },
		textColor: '#d1d4dc',
	},
	grid: {
		vertLines: { color: '#2a2a2a' },
		horzLines: { color: '#2a2a2a' },
	},
}));

const series = chart.addCustomSeries(new HoneycombSeries(), {
	...defaultHoneycombSeriesOptions,
	priceLineVisible: false,
});

series.setData([
	{
		time: 1710000000 as UTCTimestamp,
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		levels: [
			{ price: 100, values: { bid: 95, ask: 80, delta: 15 } },
			{ price: 101, values: { bid: 50, ask: 90, delta: -40 } },
		],
	},
	{
		time: 1710864000 as UTCTimestamp,
		open: 101,
		high: 103,
		low: 100,
		close: 102,
		levels: [
			{ price: 101, values: { bid: 88, ask: 50, delta: 38 } },
			{ price: 102, values: { bid: 30, ask: 170, delta: -140 } },
		],
	},
]);

chart.timeScale().fitContent();
